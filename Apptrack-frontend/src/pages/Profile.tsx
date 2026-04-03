import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Palette, Check, Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/components/refine-ui/theme/theme-provider'
import { cn } from '@/lib/utils'

// Color themes inspired by tweakcn
const colorThemes = [
    { name: 'Default', primary: 'oklch(0.6420 0.1691 38.5815)', accent: 'oklch(0.4138 0.0846 259.8759)', class: 'theme-default' },
    { name: 'Rose', primary: 'oklch(0.6455 0.2123 12.5913)', accent: 'oklch(0.5693 0.1458 4.6328)', class: 'theme-rose' },
    { name: 'Blue', primary: 'oklch(0.6232 0.1665 253.1006)', accent: 'oklch(0.5445 0.1925 262.8812)', class: 'theme-blue' },
    { name: 'Green', primary: 'oklch(0.6237 0.1697 145.4743)', accent: 'oklch(0.5188 0.1334 154.0291)', class: 'theme-green' },
    { name: 'Violet', primary: 'oklch(0.6058 0.2315 292.7551)', accent: 'oklch(0.5309 0.2231 296.8247)', class: 'theme-violet' },
    { name: 'Orange', primary: 'oklch(0.7050 0.1912 47.6042)', accent: 'oklch(0.6469 0.1998 38.4042)', class: 'theme-orange' },
]

const modeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'System', icon: Monitor },
]

const Profile = () => {
    const { theme, setTheme } = useTheme()
    const [selectedColorTheme, setSelectedColorTheme] = useState('theme-default')

    // Load saved color theme on mount
    useEffect(() => {
        const savedTheme = localStorage.getItem('color-theme') || 'theme-default'
        setSelectedColorTheme(savedTheme)
        if (savedTheme !== 'theme-default') {
            document.documentElement.classList.add(savedTheme)
        }
    }, [])

    const applyColorTheme = (themeClass: string) => {
        setSelectedColorTheme(themeClass)
        // Remove all theme classes
        document.documentElement.classList.remove(...colorThemes.map(t => t.class))
        // Add the selected theme class
        if (themeClass !== 'theme-default') {
            document.documentElement.classList.add(themeClass)
        }
        localStorage.setItem('color-theme', themeClass)
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground tracking-tight">Appearance</h1>
                <p className="text-muted-foreground mt-1">Customize how Northwoods looks</p>
            </div>

            {/* Appearance */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Palette className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle>Appearance</CardTitle>
                            <CardDescription>Customize how AppTrack looks</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Mode Selection */}
                    <div className="space-y-3">
                        <Label>Mode</Label>
                        <div className="flex gap-2">
                            {modeOptions.map((option) => {
                                const Icon = option.icon
                                const isSelected = theme === option.value
                                return (
                                    <Button
                                        key={option.value}
                                        variant={isSelected ? 'default' : 'outline'}
                                        className={cn('flex-1', isSelected && 'ring-2 ring-primary ring-offset-2')}
                                        onClick={() => setTheme(option.value)}
                                    >
                                        <Icon className="h-4 w-4 mr-2" />
                                        {option.label}
                                    </Button>
                                )
                            })}
                        </div>
                    </div>

                    <Separator />

                    {/* Color Theme Selection */}
                    <div className="space-y-3">
                        <Label>Color Theme</Label>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                            {colorThemes.map((colorTheme) => {
                                const isSelected = selectedColorTheme === colorTheme.class
                                return (
                                    <button
                                        key={colorTheme.class}
                                        onClick={() => applyColorTheme(colorTheme.class)}
                                        className={cn(
                                            'relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all',
                                            isSelected
                                                ? 'border-primary bg-primary/5 shadow-md'
                                                : 'border-border hover:border-primary/50 hover:bg-muted/50'
                                        )}
                                    >
                                        <div className="flex gap-1">
                                            <div
                                                className="w-6 h-6 rounded-full shadow-inner"
                                                style={{ backgroundColor: colorTheme.primary }}
                                            />
                                            <div
                                                className="w-6 h-6 rounded-full shadow-inner"
                                                style={{ backgroundColor: colorTheme.accent }}
                                            />
                                        </div>
                                        <span className="text-xs font-medium">{colorTheme.name}</span>
                                        {isSelected && (
                                            <div className="absolute -top-1 -right-1 h-5 w-5 bg-primary rounded-full flex items-center justify-center">
                                                <Check className="h-3 w-3 text-primary-foreground" />
                                            </div>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>

        </div>
    )
}

export default Profile
