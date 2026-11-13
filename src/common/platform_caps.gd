class_name PlatformCaps
extends Resource

## What the running platform allows. Written only by platform HFSM contexts,
## read by game UI (shared live `.tres`). Defaults = most restrictive (mobile).

@export var platform: String = "unknown"
## System share sheet for invite links (store builds); otherwise the link goes to the clipboard.
@export var share_sheet: bool = false
## Public site that turns `/r/<code>` into «open the game or the store» (concept/tech.md).
@export var invite_base_url: String = "https://bluffcards.app/r/"
