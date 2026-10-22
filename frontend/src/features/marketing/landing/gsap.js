import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText, DrawSVGPlugin)

/**
 * Media queries every scene uses with gsap.matchMedia(). Scenes build their
 * full choreography only for `story`; `simple` gets light reveals; anything
 * with reduced motion keeps the static markup, which is the final state.
 */
export const MOTION = {
  story: '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
  simple: '(max-width: 767px) and (prefers-reduced-motion: no-preference)',
  motion: '(prefers-reduced-motion: no-preference)',
}

export { gsap, useGSAP, ScrollTrigger, SplitText }
