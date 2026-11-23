import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"

type DynamicOptions = {
  loading?: ComponentType
  ssr?: boolean
}

export default function dynamic<TProps extends object>(
  loader: () => Promise<{ default: ComponentType<TProps> } | ComponentType<TProps>>,
  options: DynamicOptions = {}
) {
  const LazyComponent = lazy(async () => {
    const loaded = await loader()
    return typeof loaded === "object" && "default" in loaded
      ? loaded
      : { default: loaded as ComponentType<TProps> }
  })

  function DynamicComponent(props: TProps) {
    const fallback: ReactNode = options.loading ? <options.loading /> : null
    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    )
  }

  if (options.ssr !== false) return DynamicComponent

  return function DynamicClientComponent(props: TProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => setMounted(true), [])

    if (!mounted) return options.loading ? <options.loading /> : null
    return <DynamicComponent {...props} />
  }
}
