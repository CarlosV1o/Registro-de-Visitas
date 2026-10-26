# shadcn-vue UI

Components were generated from the official shadcn-vue registry using style `reka-luma` and preset `axPhMWG` with CLI 2.8.2. Local changes include project formatting, Spanish labels, a `success` Badge variant backed by the `--success` token, select popover positioning, an exposed Input focus method and assertion-free controlled state in SidebarProvider.

`shadcn.css` is the unmodified `dist/tailwind.css` from the [shadcn-vue 2.8.2 package](https://www.npmjs.com/package/shadcn-vue/v/2.8.2). It is vendored so that the app does not depend on the CLI and its code-transformation dependencies. The upstream MIT license is in `LICENSE`.

Use the shadcn-vue CLI through `npx` to add components. Do not add the CLI to runtime dependencies just to import its CSS.
