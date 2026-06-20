import { useEffect } from "react"

export function useDismissibleMenu<T>(menu: T | null, setMenu: (value: T | null) => void) {
  useEffect(() => {
    if (!menu) return

    const closeMenu = () => setMenu(null)

    document.addEventListener("click", closeMenu)
    document.addEventListener("keydown", closeMenu)
    return () => {
      document.removeEventListener("click", closeMenu)
      document.removeEventListener("keydown", closeMenu)
    }
  }, [menu, setMenu])
}
