import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Lock, Eye, EyeOff, Briefcase, TrendingUp, Target, CheckCircle2 } from "lucide-react";

export default function Login() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        usernameOrEmail: "",
        password: "",
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
        setError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const isEmail = formData.usernameOrEmail.includes("@");

            if (isEmail) {
                const { error } = await authClient.signIn.email({
                    email: formData.usernameOrEmail,
                    password: formData.password,
                });
                if (error) {
                    setError(error.message || "Invalid email or password");
                    setIsLoading(false);
                    return;
                }
            } else {
                const { error } = await authClient.signIn.username({
                    username: formData.usernameOrEmail,
                    password: formData.password,
                });
                if (error) {
                    setError(error.message || "Invalid username or password");
                    setIsLoading(false);
                    return;
                }
            }

            navigate("/");
        } catch {
            setError("An unexpected error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex">
            {/* Left side - Form */}
            <div className="flex-1 flex items-center justify-center p-8 lg:p-12">
                <div className="w-full max-w-md space-y-8">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                            <Briefcase className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <span className="text-xl font-bold">AppTrack</span>
                    </div>

                    {/* Header */}
                    <div className="space-y-2">
                        <h1 className="text-4xl font-bold tracking-tight">Welcome back!</h1>
                        <p className="text-muted-foreground text-lg">
                            Sign in to continue tracking your applications
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-xl border border-destructive/20">
                            {error}
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">
                                Email or Username
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                <Input
                                    name="usernameOrEmail"
                                    type="text"
                                    placeholder="Enter your email or username"
                                    value={formData.usernameOrEmail}
                                    onChange={handleChange}
                                    required
                                    disabled={isLoading}
                                    className="h-14 pl-12 pr-4 text-base rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                <Input
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Enter your password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                    disabled={isLoading}
                                    className="h-14 pl-12 pr-12 text-base rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-14 text-base font-semibold rounded-xl"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                "Sign In"
                            )}
                        </Button>
                    </form>

                    {/* Footer */}
                    <p className="text-center text-muted-foreground">
                        Don't have an account?{" "}
                        <Link to="/signup" className="text-primary font-semibold hover:underline">
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>

            {/* Right side - Visual Panel */}
            <div className="hidden lg:flex flex-1 relative overflow-hidden bg-gradient-to-br from-primary/90 via-primary to-primary/80 p-12">
                {/* Background pattern */}
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-20 left-20 w-64 h-64 border border-white/20 rounded-full" />
                    <div className="absolute top-40 left-40 w-96 h-96 border border-white/20 rounded-full" />
                    <div className="absolute bottom-20 right-20 w-80 h-80 border border-white/20 rounded-full" />
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-between h-full text-primary-foreground">
                    {/* Top */}
                    <div className="space-y-6">
                        <h2 className="text-5xl font-bold leading-tight">
                            Track your job<br />applications<br />with ease
                        </h2>
                        <p className="text-xl text-primary-foreground/80 max-w-md">
                            Stay organized and never miss an opportunity. Your career journey, simplified.
                        </p>
                    </div>

                    {/* Features */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-sm rounded-2xl p-4">
                            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                                <Target className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Track Applications</h3>
                                <p className="text-sm text-primary-foreground/70">Monitor every application status</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-sm rounded-2xl p-4">
                            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                                <TrendingUp className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Analytics & Insights</h3>
                                <p className="text-sm text-primary-foreground/70">Visualize your job search progress</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-sm rounded-2xl p-4">
                            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                                <CheckCircle2 className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Stay Organized</h3>
                                <p className="text-sm text-primary-foreground/70">Never miss a follow-up again</p>
                            </div>
                        </div>
                    </div>

                    {/* Bottom quote */}
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6">
                        <p className="text-lg italic text-primary-foreground/90">
                            "AppTrack helped me land my dream job by keeping me organized throughout my search."
                        </p>
                        <p className="mt-3 text-sm text-primary-foreground/70">— Happy User</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

