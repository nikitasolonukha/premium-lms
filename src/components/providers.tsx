'use client';
import { ThemeProvider, useTheme } from 'next-themes';
import { Toaster } from 'sonner';
import { Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
export function Providers({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      nonce={nonce}
      disableTransitionOnChange
    >
      {children}
      <Toaster richColors position="bottom-right" closeButton />
    </ThemeProvider>
  );
}
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      className="icon-button theme-toggle"
      aria-label="Переключить тему"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun size={19} className="sun-icon" />
      <Moon size={19} className="moon-icon" />
    </button>
  );
}
