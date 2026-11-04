import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { getter, register } from "gnim/gobject"
import { readFileAsync } from "ags/file"

@register({ GTypeName: "Memory", GTypeFlags: GObject.TypeFlags.NONE })
export default class Memory extends GObject.Object {
   static #instance: Memory | null = null

   static get default(): Memory {
      return (this.#instance ||= new Memory())
   }

   static toMB(bytes: number): number {
      return bytes / 1024 ** 2
   }

   static toGB(bytes: number) {
      return bytes / 1024 ** 3
   }

   @getter(Number) get total() {
      return this.#total
   }

   @getter(Number) get free() {
      return this.#free
   }

   @getter(Number) get available() {
      return this.#available
   }

   @getter(Number) get used() {
      return this.#used
   }

   @getter(Number) get usedPercent() {
      return this.#usedPercent
   }

   constructor() {
      super()

      GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
         this.#update()
         return GLib.SOURCE_REMOVE
      })

      GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
         this.#update()
         return GLib.SOURCE_CONTINUE
      })
   }

   #total: number = 0
   #free: number = 0
   #available: number = 0
   #used: number = 0
   #usedPercent: number = 0

   async #update(): Promise<void> {
      try {
         const content = await readFileAsync("/proc/meminfo")

         if (content) {
            const lines = content.split("\n")

            for (const line of lines) {
               if (line.startsWith("MemTotal")) {
                  const value = parseBytesInt(line)

                  if (this.#total !== value) {
                     this.#total = value
                     this.notify("total")
                  }
               } else if (line.startsWith("MemFree")) {
                  const value = parseBytesInt(line)

                  if (this.#free !== value) {
                     this.#free = value
                     this.notify("free")
                  }
               } else if (line.startsWith("MemAvailable")) {
                  const value = parseBytesInt(line)

                  if (this.#available !== value) {
                     this.#available = value
                     this.notify("available")
                  }

                  break
               }
            }
         }

         const used = this.total - this.available
         const usedPercent = Math.round((used / this.total) * 100)

         if (this.#used !== used) {
            this.#used = used
            this.notify("used")
         }

         if (this.#usedPercent !== usedPercent) {
            this.#usedPercent = usedPercent
            this.notify("used-percent")
         }
      } catch (err) {
         console.error("Memory Service [ERROR]: Failed to read file /proc/meminfo. ", err)
      }
   }
}

function parseBytesInt(line: string): number {
   return +line.replace(/\D/g, "") * 1024
}
