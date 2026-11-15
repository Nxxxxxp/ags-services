/**
 * @author Vladislav Stepanov
 * @copyright 2026
 * @link https://github.com/Nxxxxxp
 * @license MIT
 */

import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { getter, register } from "gnim/gobject"

const ROOT_FILE = Gio.File.new_for_path("/")

/**
 * Service for monitoring disk usage, built according to Astal standards.
 * Provides formatting and system metrics tracking.
 */
@register({ GTypeName: "Disk", GTypeFlags: GObject.TypeFlags.NONE })
export default class Disk extends GObject.Object {
   static #instance: Disk | null = null

   /**
    * Get the singleton of the class.
    * @returns {Disk} Singleton instance.
    */
   static get default(): Disk {
      if (!this.#instance) this.#instance = new Disk()
      return this.#instance
   }

   /**
    * Converts bytes (B) to megabytes (MB) with an optional precision.
    * @param {number} bytes The value in bytes to convert.
    * @param {number} [decimals=2] The number of decimal places.
    * @returns {number} The value converted to MB.
    */
   static toMB(bytes: number, decimals: number = 2): number {
      return bytes >= 0 ? +(bytes / 1024 ** 2).toFixed(decimals) : -1
   }

   /**
    * Converts bytes (B) to gigabytes (GB) with an optional precision.
    * @param {number} bytes The value in bytes to convert.
    * @param {number} [decimals=2] The number of decimal places.
    * @returns {number} The value converted to GB.
    */
   static toGB(bytes: number, decimals: number = 2): number {
      return bytes >= 0 ? +(bytes / 1024 ** 3).toFixed(decimals) : -1
   }

   /**
    * Converts bytes (B) to terabytes (TB) with an optional precision.
    * @param {number} bytes The value in bytes to convert.
    * @param {number} [decimals=2] The number of decimal places.
    * @returns {number} The value converted to TB.
    */
   static toTB(bytes: number, decimals: number = 2): number {
      return bytes >= 0 ? +(bytes / 1024 ** 4).toFixed(decimals) : -1
   }

   /**
    * The size of the root file (bytes).
    * @returns {number} Total system storage space in bytes.
    */
   @getter(Number) get size() {
      return this.#size ?? -1
   }

   /**
    * The free space of the root file (bytes).
    * @returns {number} Free system storage space in bytes.
    */
   @getter(Number) get free() {
      return this.#free ?? -1
   }

   /**
    * The actual used space of the root file (bytes).
    * @returns {number} Used system storage space in bytes.
    */
   @getter(Number) get used() {
      return this.#used ?? -1
   }

   /**
    * The percentage of the root file usage (0-100).
    * @returns {number} Used system storage space in percent.
    */
   @getter(Number) get usedPercent() {
      return this.#usedPercent ?? -1
   }

   /**
    * Interval of metrics update (seconds).
    * @returns {number} Interval in seconds
    */
   @getter(Number) get updateInterval() {
      return this.#updateInterval
   }

   /**
    * Sets new metrics update interval (seconds).
    * @param {number} value New interval in seconds.
    * @returns {void}
    */
   set updateInterval(value: number) {
      if (value > 0 && this.#updateInterval !== value) {
         this.#updateInterval = value
         this.notify("update-interval")

         this.#start()
      }
   }

   constructor() {
      super()

      GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
         this.#update()

         return GLib.SOURCE_REMOVE
      })

      this.#start()
   }

   #timerId: number | null = null

   #size: number | null = null
   #free: number | null = null
   #used: number | null = null
   #usedPercent: number | null = null
   #updateInterval: number = 3

   #start(): void {
      if (this.#timerId) {
         GLib.Source.remove(this.#timerId)
         this.#timerId = null
      }

      this.#timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.#updateInterval, () => {
         this.#update()

         return GLib.SOURCE_CONTINUE
      })
   }

   async #update(): Promise<void> {
      try {
         const info = await new Promise<Gio.FileInfo>((resolve, reject) => {
            ROOT_FILE.query_filesystem_info_async(
               `${Gio.FILE_ATTRIBUTE_FILESYSTEM_SIZE},${Gio.FILE_ATTRIBUTE_FILESYSTEM_FREE}`,
               GLib.PRIORITY_DEFAULT,
               null, // Gio.Cancellable
               (src, res) => {
                  try {
                     resolve(src!.query_filesystem_info_finish(res))
                  } catch (err) {
                     reject(err)
                  }
               },
            )
         })

         const size = info.get_attribute_uint64(Gio.FILE_ATTRIBUTE_FILESYSTEM_SIZE)
         const free = info.get_attribute_uint64(Gio.FILE_ATTRIBUTE_FILESYSTEM_FREE)

         const used = size >= free ? size - free : -1
         const usedPercent = used >= 0 && size > 0 ? Math.round((used / size) * 100) : -1

         if (this.#size !== size) {
            this.#size = size
            this.notify("size")
         }

         if (this.#free !== free) {
            this.#free = free
            this.notify("free")
         }

         if (this.#used !== used) {
            this.#used = used
            this.notify("used")
         }

         if (this.#usedPercent !== usedPercent) {
            this.#usedPercent = usedPercent
            this.notify("used-percent")
         }
      } catch (err) {
         logErr("Failed to read /.", err)
      }
   }
}

function logErr(context: string, err: unknown): void {
   logError(err as any, `Disk Service [ERROR]: ${context}`)
}
