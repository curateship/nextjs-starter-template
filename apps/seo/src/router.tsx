import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { HomePage } from '@/pages/home-page'
import { SsoExchangePage } from '@/pages/sso-exchange-page'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const ssoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/sso',
  component: SsoExchangePage,
})

const routeTree = rootRoute.addChildren([homeRoute, ssoRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
