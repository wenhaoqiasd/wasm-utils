# Release And Site Update Notes

When `@wenhaoqi/wasm_design_utils` is ready to publish but `npm publish` requires OTP or web authorization, ask the user to complete the publish locally:

```bash
cd /Users/haoqi/Documents/wasm-utils
npm publish --access public
```

If npm asks for a one-time password, enter the current authenticator code. If npm opens a browser authorization flow, finish the authorization in the browser and return to the terminal.

Before publishing, verify the package:

```bash
cd /Users/haoqi/Documents/wasm-utils
npm test
node scripts/ensure-wasm-built.js
npm pack --dry-run
```

After the package is published, update `mysite2026` to consume the released package:

```bash
cd /Users/haoqi/Documents/mysite2026
pnpm update @wenhaoqi/wasm_design_utils
```

Then remove the temporary site-side color conversion wrapper and use the package API directly:

```ts
import {
  init as initColorConvert,
  oklch2rgb_abs,
  rgb2oklch,
} from "@wenhaoqi/wasm_design_utils/color"
```

Delete `app/(mdx)/components/color_convert_streaming.ts` once the site imports `@wenhaoqi/wasm_design_utils/color` directly.

Before considering the update done, run the relevant site checks and verify MDX image fullscreen still derives its backdrop color from the image.
