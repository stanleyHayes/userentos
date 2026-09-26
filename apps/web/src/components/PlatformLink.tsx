import type { AnchorHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { platformOrigin } from '@/lib/platformOrigin'

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  /** A platform path, such as "/" or "/registry/{id}". */
  to: string
  /** On a storefront host: link to the platform origin instead of this host. */
  external: boolean
}

/**
 * A link to a RentOS page that works from a storefront host too. There a
 * router link would stay on the seller's host, where "/" is the storefront
 * itself and the rest of the app sits behind a separate sign-in.
 */
export function PlatformLink({ to, external, children, ...rest }: Props) {
  return external
    ? <a href={`${platformOrigin()}${to}`} {...rest}>{children}</a>
    : <Link to={to} {...rest}>{children}</Link>
}
