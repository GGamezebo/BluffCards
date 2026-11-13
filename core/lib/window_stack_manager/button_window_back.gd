class_name ButtonWindowBack
extends Node

## Back navigation: pressing button pops the current window via WindowStackManager.
## Prefer this over opening MainMenu directly — the stack restores the previous window.

@export var button: BaseButton
## Button inside a `LazyWindow` (instead of `button`): path from its loaded content, bound once it loads.
@export var lazy_window: LazyWindow
@export var lazy_button_path: NodePath
