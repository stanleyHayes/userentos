# Navigation query-string compatibility

Expo Router 55 / React Navigation 7 import query-string's named parse/stringify
functions. Their query-string 7 dependency includes a vulnerable URI decoder.
This bridge exports the API of upstream query-string 9.5.1, which uses the patched
decode-uri-component 0.5.x, under the older named-export shape.

Parsing is entirely upstream code. Keep the upstream dependency visible in the
lockfile and dependency audit. Do not replace it with a copied decoder or suppress
its advisories. The CommonJS entry requires Node >=20.19; Expo SDK 55 requires a
compatible modern Node runtime. Both import and require entry points are supplied for Metro and Node consumers.

Remove this override when the framework supports the patched upstream export
shape directly. Validate query options, Unicode/malformed input, real navigation,
and Android/web exports whenever changing the bridge or upstream version.

The root mobile manifest explicitly installs the upstream alias as well, because
npm file overrides alone do not reliably install a linked package's dependencies.
A clean lockfile install must retain query-string-modern and decode-uri-component.
