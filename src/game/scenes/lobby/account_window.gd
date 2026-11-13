class_name AccountWindow
extends Control

## «Аккаунт»: current profile, sign-in methods, the lesson again, account deletion (store rule).

signal ev_link(provider: String)
signal ev_lesson
signal ev_delete

@export var name_line: ListLine
@export var provider_line: ListLine
@export var respect_line: ListLine
@export var google_button: Button
@export var apple_button: Button
@export var telegram_button: Button
@export var lesson_button: Button
@export var delete_button: Button


func _ready() -> void:
	google_button.pressed.connect(func() -> void: ev_link.emit("Google"))
	apple_button.pressed.connect(func() -> void: ev_link.emit("Apple"))
	telegram_button.pressed.connect(func() -> void: ev_link.emit("Telegram"))
	lesson_button.pressed.connect(func() -> void: ev_lesson.emit())
	delete_button.pressed.connect(func() -> void: ev_delete.emit())


func setup(profile: PlayerProfile) -> void:
	name_line.setup("Профиль", profile.display_name)
	provider_line.setup("Вход", profile.provider_title())
	respect_line.setup("Уважение соперников", str(profile.respect))
