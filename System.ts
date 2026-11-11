import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import AstalHyprland from "gi://AstalHyprland?version=0.1"
import { getter, register } from "gnim/gobject"
import { execAsync } from "ags/process"

const hyprland = AstalHyprland.get_default()

@register({ GTypeName: "System", GTypeFlags: GObject.TypeFlags.NONE })
export default class System extends GObject.Object {
   static #instance: System | null = null

   static get default(): System {
      return (this.#instance ||= new System())
   }

   static poweroff(): void {
      execAsync(["systemctl", "poweroff"])
   }

   static reboot(): void {
      execAsync(["systemctl", "reboot"])
   }

   static suspend(): void {
      execAsync(["systemctl", "suspend"])
   }

   static hibernate(): void {
      execAsync(["systemctl", "hibernate"])
   }

   static switchKbLayout(): void {
      execAsync(["hyprctl", "switchxkblayout", "all", "next"])
   }

   @getter(String) get keyboardLayout() {
      return this.#keyboardLayout
   }

   #setKeyboardLayout(value: string): void {
      if (value !== this.#keyboardLayout) {
         this.#keyboardLayout = value
         this.notify("keyboard-layout")
      }
   }

   constructor() {
      super()

      GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
         execAsync(["hyprctl", "devices", "-j"])
            .then((stdout) => {
               const devices = JSON.parse(stdout)
               const main = devices.keyboards.find((keyboard: any) => keyboard.main === true)
               const activeKeymap = main.active_keymap || "English (US)"

               this.#setKeyboardLayout(activeKeymap.trim())
            })
            .catch((err) => console.error(err))

         hyprland.connect("keyboard-layout", (_src, _keyboard, layout) => this.#setKeyboardLayout(layout))

         return GLib.SOURCE_REMOVE
      })
   }

   #keyboardLayout: string = "English (US)"
}
