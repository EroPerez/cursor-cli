import type { ThemeName } from "./config.js"

export type ThemeColor =
  | "blue"
  | "cyan"
  | "gray"
  | "green"
  | "magenta"
  | "red"
  | "white"
  | "yellow"

export type ThemeColors = {
  user: ThemeColor
  assistant: ThemeColor
  tool: ThemeColor
  status: ThemeColor
  error: ThemeColor
  meta: ThemeColor
  border: ThemeColor
  borderActive: ThemeColor
  borderBusy: ThemeColor
  heading: ThemeColor
  code: ThemeColor
  link: ThemeColor
  dim: ThemeColor
  bullet: ThemeColor
}

const themes: Record<ThemeName, ThemeColors> = {
  dark: {
    user: "green",
    assistant: "white",
    tool: "magenta",
    status: "yellow",
    error: "red",
    meta: "cyan",
    border: "gray",
    borderActive: "green",
    borderBusy: "yellow",
    heading: "cyan",
    code: "yellow",
    link: "blue",
    dim: "gray",
    bullet: "cyan",
  },
  light: {
    user: "green",
    assistant: "white",
    tool: "magenta",
    status: "yellow",
    error: "red",
    meta: "blue",
    border: "gray",
    borderActive: "blue",
    borderBusy: "yellow",
    heading: "blue",
    code: "magenta",
    link: "cyan",
    dim: "gray",
    bullet: "blue",
  },
  dracula: {
    user: "green",
    assistant: "white",
    tool: "magenta",
    status: "yellow",
    error: "red",
    meta: "cyan",
    border: "gray",
    borderActive: "magenta",
    borderBusy: "yellow",
    heading: "magenta",
    code: "green",
    link: "cyan",
    dim: "gray",
    bullet: "magenta",
  },
  nord: {
    user: "cyan",
    assistant: "white",
    tool: "blue",
    status: "yellow",
    error: "red",
    meta: "cyan",
    border: "gray",
    borderActive: "cyan",
    borderBusy: "yellow",
    heading: "cyan",
    code: "blue",
    link: "cyan",
    dim: "gray",
    bullet: "blue",
  },
  monokai: {
    user: "green",
    assistant: "white",
    tool: "magenta",
    status: "yellow",
    error: "red",
    meta: "cyan",
    border: "gray",
    borderActive: "yellow",
    borderBusy: "yellow",
    heading: "yellow",
    code: "green",
    link: "cyan",
    dim: "gray",
    bullet: "yellow",
  },
}

export function getTheme(name: ThemeName): ThemeColors {
  return themes[name] ?? themes.dark
}
