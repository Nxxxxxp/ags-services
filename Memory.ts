/**
 * @author Vladislav Stepanov
 * @copyright Copyright (C) 2026
 * @link https://github.com/Nxxxxxp
 * @license MIT
 */

import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { getter, register } from "gnim/gobject"
import { readFileAsync } from "ags/file"

/**
 * Service for monitoring memory usage, built according to Astal standards.
 * Provides formatting and system metrics tracking.
 */
@register({ GTypeName: "Memory", GTypeFlags: GObject.TypeFlags.NONE })
export default class Memory extends GObject.Object {
   static #instance: Memory | null = null

   /**
    * Get the singleton of the class.
    * @returns {Memory} Singleton.
    */
   static get default(): Memory {
      return (this.#instance ||= new Memory())
   }

   /**
    * Converts bytes (B) to kilobytes (KB) with an optional precision.
    * @param {number} bytes The value in bytes to convert.
    * @param {number} [decimals=2] The number of decimal places.
    * @returns {number} The value converted to KB.
    */
   static toKB(bytes: number, decimals: number = 2): number {
      return +(bytes / 1024).toFixed(decimals)
   }

   /**
    * Converts bytes (B) to megabytes (MB) with an optional precision.
    * @param {number} bytes The value in bytes to convert.
    * @param {number} [decimals=2] The number of decimal places.
    * @returns {number} The value converted to MB.
    */
   static toMB(bytes: number, decimals: number = 2): number {
      return +(bytes / 1024 ** 2).toFixed(decimals)
   }

   /**
    * Converts bytes (B) to gigabytes (GB) with an optional precision.
    * @param {number} bytes The value in bytes to convert.
    * @param {number} [decimals=2] The number of decimal places.
    * @returns {number} The value converted to GB.
    */
   static toGB(bytes: number, decimals: number = 2): number {
      return +(bytes / 1024 ** 3).toFixed(decimals)
   }

   /**
    * Interval of metrics update (seconds).
    * @returns {number} Interval in seconds
    */
   @getter(Number) get updateInterval() {
      return this.#updateInterval
   }

   /**
    * Total physical memory volume (bytes).
    * @returns {number} Total memory volume in bytes.
    */
   @getter(Number) get total() {
      return this.#total
   }

   /**
    * Available memory volume that can be allocated with no Swap being used (bytes).
    * @returns {number} Available memory volume in bytes.
    */
   @getter(Number) get available() {
      return this.#available
   }

   /**
    * Actual used memory volume by apps and system (bytes).
    * @returns {number} Used memory volume in bytes.
    */
   @getter(Number) get used() {
      return this.#used
   }

   /**
    * Used memory percentage (0-100).
    * @returns {number} Used memory in percents.
    */
   @getter(Number) get usedPercent() {
      return this.#usedPercent
   }

   /**
    * Total Swap partition/file volume (bytes).
    * @returns {number} Total Swap volume in bytes.
    */
   @getter(Number) get swapTotal() {
      return this.#swapTotal
   }

   /**
    * Free Swap volume (bytes).
    * @returns {number} Free Swap volume in bytes.
    */
   @getter(Number) get swapFree() {
      return this.#swapFree
   }

   /**
    * Used Swap volume (bytes).
    * @returns {number} Used Swap volume in bytes.
    */
   @getter(Number) get swapUsed() {
      return this.#swapUsed
   }

   /**
    * Used Swap percentage (0-100).
    * @returns {number} Used Swap in percents.
    */
   @getter(Number) get swapUsedPercent() {
      return this.#swapUsedPercent
   }

   /**
    * Sets new metrics update interval (seconds).
    * @param {number} value New interval in seconds.
    * @returns {void}
    */
   set updateInterval(value: number) {
      if (value >= 0 && this.#updateInterval !== value) {
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
   #updateInterval: number = 1

   #total: number = -1
   #available: number = -1
   #used: number = -1
   #usedPercent: number = -1
   #swapTotal: number = -1
   #swapFree: number = -1
   #swapUsed: number = -1
   #swapUsedPercent: number = -1

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
               } else if (line.startsWith("MemAvailable")) {
                  const value = parseBytesInt(line)

                  if (this.#available !== value) {
                     this.#available = value
                     this.notify("available")
                  }
               } else if (line.startsWith("SwapTotal")) {
                  const value = parseBytesInt(line)

                  if (this.#swapTotal !== value) {
                     this.#swapTotal = value
                     this.notify("swap-total")
                  }
               } else if (line.startsWith("SwapFree")) {
                  const value = parseBytesInt(line)

                  if (this.#swapFree !== value) {
                     this.#swapFree = value
                     this.notify("swap-free")
                  }

                  break
               }
            }

            const used = this.#total - this.#available

            if (this.#used !== used) {
               this.#used = used
               this.notify("used")
            }

            const usedPercent = Math.round((this.#used / this.#total) * 100)

            if (this.#usedPercent !== usedPercent) {
               this.#usedPercent = usedPercent
               this.notify("used-percent")
            }

            const swapUsed = this.#swapTotal - this.#swapFree

            if (this.#swapUsed !== swapUsed) {
               this.#swapUsed = swapUsed
               this.notify("swap-used")
            }

            const swapUsedPercent = Math.round((this.#swapUsed / this.#swapTotal) * 100)

            if (this.#swapUsedPercent !== swapUsedPercent) {
               this.#swapUsedPercent = swapUsedPercent
               this.notify("swap-used-percent")
            }
         }
      } catch (err) {
         console.error("Memory Service [ERROR]: Failed to read /proc/meminfo. ", err)
      }
   }
}

/**
 * Parses kilobytes value from the line in /proc/meminfo and converts to bytes.
 * @param {string} line The line from /proc/meminfo.
 * @returns {number} Bytes value.
 */
function parseBytesInt(line: string): number {
   return +line.replace(/\D/g, "") * 1024
}
