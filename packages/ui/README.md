# @mindlink/ui

Shared visual tokens and primitive styles for MindLink's web surfaces.

The React workbench and the Vue published workbench both load `tokens.css` before their own stylesheet and `primitives.css` after it. Components use the `--ml-*` tokens for colour, spacing, radius, type and control size; the `.ui-*` primitives provide the shared shape and states of buttons, icon buttons, inputs, segmented controls, list rows and sheets.

Native platforms keep their own components and map the same product colours into their system palettes.
