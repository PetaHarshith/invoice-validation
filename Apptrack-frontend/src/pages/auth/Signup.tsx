import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, User, Mail, AtSign, Lock, Eye, EyeOff, Briefcase, Rocket, Star, Zap } from "lucide-react";

export default function Signup() {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        username: "",
        password: "",
        confirmPassword: "",
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
        setError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match");
            setIsLoading(false);
            return;
        }

        if (formData.password.length < 8) {
            setError("Password must be at least 8 characters long");
            setIsLoading(false);
            return;
        }

        try {
            const { error } = await authClient.signUp.email({
                name: formData.name,
                email: formData.email,
                username: formData.username,
                password: formData.password,
            });

            if (error) {
                setError(error.message || "Failed to create account");
                setIsLoading(false);
                return;
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
            {/* Left side - Visual Panel */}
            <div className="hidden lg:flex flex-1 relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/80 p-12">
                {/* Background pattern */}
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-10 right-10 w-48 h-48 border border-white/20 rounded-full" />
                    <div className="absolute top-32 right-32 w-72 h-72 border border-white/20 rounded-full" />
                    <div className="absolute bottom-10 left-10 w-64 h-64 border border-white/20 rounded-full" />
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-between h-full text-primary-foreground">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                            <Briefcase className="w-5 h-5" />
                        </div>
                        <span className="text-xl font-bold">AppTrack</span>
                    </div>

                    {/* Main content */}
                    <div className="space-y-8">
                        <h2 className="text-5xl font-bold leading-tight">
                            Start your<br />journey to<br />your dream job
                        </h2>
                        <p className="text-xl text-primary-foreground/80 max-w-md">
                            Join thousands of job seekers who have streamlined their application process.
                        </p>
                    </div>

                    {/* Features list */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-center">
                            <Rocket className="w-8 h-8 mx-auto mb-2" />
                            <p className="text-sm font-medium">Quick Setup</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-center">
                            <Star className="w-8 h-8 mx-auto mb-2" />
                            <p className="text-sm font-medium">Free Forever</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-center">
                            <Zap className="w-8 h-8 mx-auto mb-2" />
                            <p className="text-sm font-medium">Smart Insights</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right side - Form */}
            <div className="flex-1 flex items-center justify-center p-8 lg:p-12">
                <div className="w-full max-w-md space-y-8">
                    {/* Mobile Logo */}
                    <div className="flex items-center gap-3 lg:hidden">
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                            <Briefcase className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <span className="text-xl font-bold">AppTrack</span>
                    </div>

                    {/* Header */}
                    <div className="space-y-2">
                        <h1 className="text-4xl font-bold tracking-tight">Create account</h1>
                        <p className="text-muted-foreground text-lg">
                            Get started with your free account
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-xl border border-destructive/20">
                            {error}
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                    <Input
                                        name="name"
                                        type="text"
                                        placeholder="John Doe"
                                        value={formData.name}
                                        onChange={handleChange}
                                        required
                                        disabled={isLoading}
                                        className="h-12 pl-12 pr-4 rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Username</label>
                                <div className="relative">
                                    <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                    <Input
                                        name="username"
                                        type="text"
                                        placeholder="johndoe"
                                        value={formData.username}
                                        onChange={handleChange}
                                        required
                                        disabled={isLoading}
                                        className="h-12 pl-12 pr-4 rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                <Input
                                    name="email"
                                    type="email"
                                    placeholder="john@example.com"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    disabled={isLoading}
                                    className="h-12 pl-12 pr-4 rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                    <Input
                                        name="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="8+ chars"
                                        value={formData.password}
                                        onChange={handleChange}
                                        required
                                        disabled={isLoading}
                                        className="h-12 pl-12 pr-10 rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Confirm</label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                    <Input
                                        name="confirmPassword"
                                        type={showConfirmPassword ? "text" : "password"}
                                        placeholder="Confirm"
                                        value={formData.confirmPassword}
                                        onChange={handleChange}
                                        required
                                        disabled={isLoading}
                                        className="h-12 pl-12 pr-10 rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
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
                                    Creating account...
                                </>
                            ) : (
                                "Create Account"
                            )}
                        </Button>
                    </form>

                    {/* Footer */}
                    <p className="text-center text-muted-foreground">
                        Already have an account?{" "}
                        <Link to="/login" className="text-primary font-semibold hover:underline">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

