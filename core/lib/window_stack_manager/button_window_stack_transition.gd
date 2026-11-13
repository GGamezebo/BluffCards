class_name ButtonWindowTransition
extends Node

## Forward navigation: pressing button opens target_window on the WindowStackManager stack.

@export var button: BaseButton
@export var target_window: Control
## Button inside a `LazyWindow` (instead of `button`): path from its loaded content, bound once it loads.
@export var lazy_window: LazyWindow
@export var lazy_button_path: NodePath
## Called on the opened window (its content when lazy) right after it opens; empty = none.
@export var enter_method: StringName = &""
