import express from "express";
import { and, desc, asc, eq, ilike, or, sql } from "drizzle-orm";
import { applications } from "../db/schema";
import { db } from "../db";
import { z } from "zod";

const router = express.Router();

// Valid status values from schema
const VALID_STATUSES = ["Applied", "OA", "Interview", "Offer", "Rejected", "Withdrawn"] as const;
const MAX_LIMIT = 100;

// Helper to validate status
const isValidStatus = (status: any): status is typeof VALID_STATUSES[number] => {
    return VALID_STATUSES.includes(status);
};

// Helper to validate date string (YYYY-MM-DD format)
const isValidDate = (dateString: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
};

// Zod schema for creating an application
const createApplicationSchema = z.object({
    userId: z.number().int().positive(),
    company: z.string().trim().min(1, "Company name is required").max(120, "Company name too long"),
    position: z.string().trim().min(1, "Position is required").max(150, "Position too long"),
    status: z.enum(VALID_STATUSES).optional().default("Applied"),
    dateApplied: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").refine(isValidDate, "Invalid date").nullable().optional(),
    jobUrl: z.union([z.string().min(1), z.literal(""), z.null()]).optional(),
    notes: z.string().nullable().optional(),
});

// Zod schema for updating an application
const updateApplicationSchema = createApplicationSchema.partial().omit({ userId: true });

// Get dashboard statistics
router.get("/stats", async (_req, res) => {
    try {
        // Get status counts
        const statusCounts = await db
            .select({
                status: applications.status,
                count: sql<number>`count(*)::int`
            })
            .from(applications)
            .groupBy(applications.status);

        // Get total count
        const totalResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(applications);
        const total = totalResult[0]?.count ?? 0;

        // Get applications by month (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyApplications = await db
            .select({
                month: sql<string>`to_char(created_at, 'YYYY-MM')`,
                count: sql<number>`count(*)::int`
            })
            .from(applications)
            .where(sql`created_at >= ${sixMonthsAgo.toISOString()}`)
            .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
            .orderBy(sql`to_char(created_at, 'YYYY-MM')`);

        // Get recent applications (last 5)
        const recentApplications = await db
            .select({
                id: applications.id,
                company: applications.company,
                position: applications.position,
                status: applications.status,
                dateApplied: applications.dateApplied,
                createdAt: applications.createdAt
            })
            .from(applications)
            .orderBy(desc(applications.createdAt))
            .limit(5);

        // Calculate response rate (interviews + offers) / total
        const statusMap: Record<string, number> = {};
        statusCounts.forEach(s => {
            statusMap[s.status] = s.count;
        });

        const interviews = statusMap['Interview'] || 0;
        const offers = statusMap['Offer'] || 0;
        const rejections = statusMap['Rejected'] || 0;
        const responseRate = total > 0 ? Math.round(((interviews + offers + rejections) / total) * 100) : 0;
        const successRate = total > 0 ? Math.round(((interviews + offers) / total) * 100) : 0;

        res.status(200).json({
            data: {
                total,
                statusCounts: statusMap,
                monthlyApplications,
                recentApplications,
                responseRate,
                successRate
            }
        });
    } catch (error) {
        console.error("[GET /applications/stats] Error:", error);
        res.status(500).json({ error: "Failed to fetch statistics" });
    }
});

// Valid sort fields
const VALID_SORT_FIELDS = ["dateApplied", "createdAt", "company", "position", "status"] as const;

// Get all applications with optional search, filtering, sorting and pagination
router.get("/", async (req, res) => {
    try {
        const { search, status, page = "1", limit = "10", sort = "dateApplied", order = "desc" } = req.query;

        // Validate and parse pagination params
        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);

        if (isNaN(pageNum) || pageNum < 1) {
            return res.status(400).json({ error: "Invalid page number" });
        }

        if (isNaN(limitNum) || limitNum < 1) {
            return res.status(400).json({ error: "Invalid limit" });
        }

        const currentPage = pageNum;
        const limitPerPage = Math.min(limitNum, MAX_LIMIT);

        if (limitNum > MAX_LIMIT) {
            // Inform client that limit was capped
            res.setHeader('X-Limit-Capped', 'true');
        }

        const offset = (currentPage - 1) * limitPerPage;

        // Validate sort field
        const sortField = VALID_SORT_FIELDS.includes(sort as typeof VALID_SORT_FIELDS[number])
            ? (sort as string)
            : "dateApplied";

        // Validate sort order
        const sortOrder = (order === "asc" || order === "desc") ? order : "desc";

        const filterConditions = [];

        // If search query exists, filter by company name
        if (search && typeof search === "string") {
            const trimmedSearch = search.trim();
            if (trimmedSearch) {
                filterConditions.push(
                    or(
                        ilike(applications.company, `%${trimmedSearch}%`)
                        //ilike(applications.position, `%${trimmedSearch}%`)
                    )!
                );
            }
        }

        // If status filter exists, validate and match status
        if (status && typeof status === "string") {
            if (!isValidStatus(status)) {
                return res.status(400).json({
                    error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`
                });
            }
            filterConditions.push(eq(applications.status, status));
        }

        // Combine all filters using AND if any exist
        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        // Get total count for pagination
        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(applications)
            .where(whereClause);

        const totalCount = Number(countResult[0]?.count ?? 0);

        // Build dynamic orderBy clause based on sort field and order
        const getOrderByClause = () => {
            const column = sortField === "dateApplied" ? applications.dateApplied
                : sortField === "createdAt" ? applications.createdAt
                    : sortField === "company" ? applications.company
                        : sortField === "position" ? applications.position
                            : sortField === "status" ? applications.status
                                : applications.dateApplied;

            return sortOrder === "asc" ? asc(column) : desc(column);
        };

        // Get applications list with dynamic sorting
        const applicationsList = await db
            .select()
            .from(applications)
            .where(whereClause)
            .orderBy(getOrderByClause())
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: applicationsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        });
    } catch (error) {
        console.error("[GET /applications] Error:", error);
        res.status(500).json({ error: "Failed to fetch applications" });
    }
});

// Get a single application by ID
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ID
        const appId = parseInt(id, 10);
        if (isNaN(appId)) {
            return res.status(400).json({ error: "Invalid application ID" });
        }

        const application = await db
            .select()
            .from(applications)
            .where(eq(applications.id, appId))
            .limit(1);

        if (!application || application.length === 0) {
            return res.status(404).json({ error: "Application not found" });
        }

        res.status(200).json({ data: application[0] });
    } catch (error) {
        console.error(`[GET /applications/${req.params.id}] Error:`, error);
        res.status(500).json({ error: "Failed to fetch application" });
    }
});

// Create a new application
router.post("/", async (req, res) => {
    try {
        // Validate request body with Zod
        const validationResult = createApplicationSchema.safeParse(req.body);

        if (!validationResult.success) {
            const errors = validationResult.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message
            }));
            return res.status(400).json({
                error: "Validation failed",
                details: errors
            });
        }

        const validatedData = validationResult.data;

        const newApplication = await db
            .insert(applications)
            .values({
                userId: validatedData.userId,
                company: validatedData.company,
                position: validatedData.position,
                status: validatedData.status,
                dateApplied: validatedData.dateApplied || null,
                jobUrl: validatedData.jobUrl || null,
                notes: validatedData.notes || null,
            })
            .returning();

        res.status(201).json({ data: newApplication[0] });
    } catch (error) {
        console.error("[POST /applications] Error:", error);
        res.status(500).json({ error: "Failed to create application" });
    }
});

// Update an application
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ID
        const appId = parseInt(id, 10);
        if (isNaN(appId)) {
            return res.status(400).json({ error: "Invalid application ID" });
        }

        // Validate request body with Zod
        const validationResult = updateApplicationSchema.safeParse(req.body);

        if (!validationResult.success) {
            const errors = validationResult.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message
            }));
            return res.status(400).json({
                error: "Validation failed",
                details: errors
            });
        }

        const validatedData = validationResult.data;

        if (Object.keys(validatedData).length === 0) {
            return res.status(400).json({ error: "No fields to update" });
        }

        const updatedApplication = await db
            .update(applications)
            .set(validatedData)
            .where(eq(applications.id, appId))
            .returning();

        if (!updatedApplication || updatedApplication.length === 0) {
            return res.status(404).json({ error: "Application not found" });
        }

        res.status(200).json({ data: updatedApplication[0] });
    } catch (error) {
        console.error(`[PUT /applications/${req.params.id}] Error:`, error);
        res.status(500).json({ error: "Failed to update application" });
    }
});

// Delete an application
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ID
        const appId = parseInt(id, 10);
        if (isNaN(appId)) {
            return res.status(400).json({ error: "Invalid application ID" });
        }

        const deletedApplication = await db
            .delete(applications)
            .where(eq(applications.id, appId))
            .returning();

        if (!deletedApplication || deletedApplication.length === 0) {
            return res.status(404).json({ error: "Application not found" });
        }

        res.status(200).json({ data: deletedApplication[0] });
    } catch (error) {
        console.error(`[DELETE /applications/${req.params.id}] Error:`, error);
        res.status(500).json({ error: "Failed to delete application" });
    }
});

export default router;

