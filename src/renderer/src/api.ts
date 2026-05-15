import type { AtermAPI } from '../../preload'

declare global {
  interface Window {
    aterm: AtermAPI
  }
}

export const aterm = window.aterm
