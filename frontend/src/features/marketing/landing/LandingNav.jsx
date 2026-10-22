import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Logo } from '../../../shared/ui/Logo'

const NAV_LINKS = [
  { href: '#problem', label: 'The problem' },
  { href: '#idea', label: 'The idea' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
]

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'

const linkTone =
  'transition-colors duration-200 group-data-[theme=dark]:text-white/70 group-data-[theme=dark]:hover:text-white group-data-[theme=light]:text-muted-foreground group-data-[theme=light]:hover:text-foreground'

/**
 * The page sets `data-theme` on the header as dark and light chapters pass
 * underneath it, so the nav restyles itself without re-rendering React.
 */
export function LandingNav({ ref, cta }) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event) => event.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menuOpen])

  return (
    <header
      ref={ref}
      data-theme="dark"
      className="group fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 data-[theme=dark]:border-white/10 data-[theme=dark]:bg-neutral-950/60 data-[theme=light]:border-border/70 data-[theme=light]:bg-background/75 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <a href="#top" aria-label="Grasyn home" className={`rounded ${focus}`}>
          {/* The dark logo's blue is tuned for the brand gradient and reads dim on near-black. */}
          <Logo on="dark" size="sm" className="brightness-150 group-data-[theme=light]:hidden" />
          <Logo on="light" size="sm" className="hidden group-data-[theme=light]:block" />
        </a>

        <nav
          aria-label="Story chapters"
          className="hidden items-center gap-6 text-body-sm font-medium md:flex"
        >
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={`rounded ${linkTone} ${focus}`}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {cta.secondary ? (
            <Link
              to={cta.secondary.to}
              viewTransition
              className={`hidden whitespace-nowrap rounded-full px-3 py-2 text-body-sm font-medium transition-colors sm:inline-flex duration-200 group-data-[theme=dark]:text-white/75 group-data-[theme=dark]:hover:text-white group-data-[theme=light]:text-muted-foreground group-data-[theme=light]:hover:text-foreground ${focus}`}
            >
              {cta.secondary.label}
            </Link>
          ) : null}
          <Link
            to={cta.primary.to}
            viewTransition
            className={`inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full px-4 text-body-sm font-medium transition-colors duration-200 group-data-[theme=dark]:bg-white group-data-[theme=dark]:text-neutral-950 group-data-[theme=dark]:hover:bg-brand-100 group-data-[theme=light]:bg-primary group-data-[theme=light]:text-primary-foreground group-data-[theme=light]:hover:bg-primary-hover sm:h-10 sm:px-5 ${focus}`}
          >
            {cta.primary.label}
          </Link>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
            aria-label={menuOpen ? 'Close chapter menu' : 'Open chapter menu'}
            onClick={() => setMenuOpen((open) => !open)}
            className={`inline-flex size-9 items-center justify-center rounded-full md:hidden group-data-[theme=dark]:hover:bg-white/10 group-data-[theme=light]:hover:bg-muted ${linkTone} ${focus}`}
          >
            {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="landing-mobile-menu"
          aria-label="Story chapters"
          className="border-t px-6 pb-4 pt-2 md:hidden group-data-[theme=dark]:border-white/10 group-data-[theme=dark]:bg-neutral-950/90 group-data-[theme=light]:border-border/70 group-data-[theme=light]:bg-background/95"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`block rounded py-3 text-body font-medium ${linkTone} ${focus}`}
            >
              {link.label}
            </a>
          ))}
          {cta.secondary ? (
            <Link
              to={cta.secondary.to}
              viewTransition
              className={`block rounded py-3 text-body font-medium sm:hidden ${linkTone} ${focus}`}
            >
              {cta.secondary.label}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </header>
  )
}
