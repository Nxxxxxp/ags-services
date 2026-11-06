/**
 * @author Vladislav Stepanov
 * @copyright Copyright (C) 2026
 * @link https://github.com/Nxxxxxp
 * @license MIT
 */

import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { getter, register } from "gnim/gobject"
import { readFile, readFileAsync } from "ags/file"

export interface LogicalCpuData {
   name: string
   usagePercent: number
   freq: number
   temp: number
}

export interface LogicalCpuTopology {
   coreId: number
   dieId: number
}

export const enum HwmonDriver {
   CORETEMP = "coretemp",
   K10TEMP = "k10temp",
   ZENPOWER = "zenpower",
}

/**
 * Service for monitoring CPU statistics, built according to Astal standards.
 * Provides system metrics tracking.
 */
@register({ GTypeName: "Cpu", GTypeFlags: GObject.TypeFlags.NONE })
export default class Cpu extends GObject.Object {
   static #instance: Cpu | null = null

   /**
    * Get the singleton of the class.
    * @returns {Memory} Singleton instance.
    */
   static get default(): Cpu {
      return (this.#instance ||= new Cpu())
   }

   /**
    * Vendor name (Intel, AMD).
    * @returns {string} CPU vendor name.
    */
   @getter(String) get vendor() {
      return this.#vendor
   }

   /**
    * Hwmon driver name (coretemp, k10temp, zenpower).
    * @returns {string} CPU hwmon driver name.
    */
   @getter(String) get driver() {
      return this.#driver
   }

   /**
    * Commercial CPU model name (e.g. 12th Gen Intel Core i5-12600KF).
    * @returns {string} CPU model name.
    */
   @getter(String) get modelName() {
      return this.#modelName
   }

   /**
    * CPU usage percentage (0-100).
    * @returns {number} CPU usage in percent.
    */
   @getter(Number) get usagePercent() {
      return this.#usagePercent
   }

   /**
    * CPU package temperature representing the resulting temperature
    * from core dies, SMD components, thermal interface, and substrate (in degrees Celsius).
    * @returns {number} CPU package temperature in degrees Celsius.
    */
   @getter(Number) get packageTemp() {
      return this.#packageTemp
   }

   /**
    * Number of physical CPU cores.
    * @returns {number} CPU cores number.
    */
   @getter(Number) get coresNum() {
      return this.#coresNum
   }

   /**
    * Number of logical CPU cores.
    * @returns {number} CPU logical cores number.
    */
   @getter(Number) get processorsNum() {
      return this.#processorsNum
   }

   /**
    * CPU individual logical cores metrics (name, usagePercent, frequency, temperature).
    * @returns {object} CPU logical cores data.
    */
   @getter(Object) get cores() {
      return this.#cores
   }

   constructor() {
      super()

      GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
         this.#cacheStaticInfo()
         this.#cacheHwmonPath()
         this.#cacheTopology()

         this.#update()

         return GLib.SOURCE_REMOVE
      })

      this.#start()
   }

   #timerId: number | null = null
   #hwmon: string | null = null
   #topology = new Map<string, LogicalCpuTopology>()
   #history = new Map<string, { total: number; idle: number }>()

   #vendor: string = "Unknown"
   #driver: string = "Unknown"
   #modelName: string = "Unknown"
   #usagePercent: number = -1
   #packageTemp: number = -1
   #coresNum: number = -1
   #processorsNum: number = -1
   #cores: LogicalCpuData[] = []
   #updateInterval: number = 1

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

   #cacheStaticInfo(): void {
      try {
         const content = readFile("/proc/cpuinfo")
         const lines = content.split("\n")

         for (const line of lines) {
            if (line.startsWith("vendor_id")) {
               const parts = line.split(":")

               if (parts.length > 1) {
                  this.#vendor = parts[1].trim().replace(/(Genuine|Authentic)/g, "")
                  this.notify("vendor")
               }
            } else if (line.startsWith("model name")) {
               const parts = line.split(":")

               if (parts.length > 1) {
                  this.#modelName = parts[1].trim().replace(/\(R\)|\(TM\)|\d+-Core\sProcessor/g, "")
                  this.notify("model-name")
               }
            } else if (line.startsWith("cpu cores")) {
               this.#coresNum = +line.replaceAll(/\D/g, "")
               this.notify("cores-num")

               break
            }
         }
      } catch (err) {
         logServiceError("Failed to read /proc/cpuinfo.", err)

         this.#vendor = "Unknown"
         this.#modelName = "Unknown"
         this.#coresNum = -1
      }

      this.#processorsNum = GLib.get_num_processors()
      this.notify("processors-num")
   }

   #cacheHwmonPath(): void {
      for (let i = 0; i <= 9; i++) {
         try {
            const content = readFile(`/sys/class/hwmon/hwmon${i}/name`)
            const name = content.trim()

            if (name === HwmonDriver.CORETEMP || name === HwmonDriver.K10TEMP || name === HwmonDriver.ZENPOWER) {
               this.#hwmon = `/sys/class/hwmon/hwmon${i}`
               this.#driver = name

               return
            }
         } catch (err) {
            logServiceError("Failed to cache CPU hwmon path.", err)
            this.#hwmon = null
            this.#driver = "Unknown"
         }
      }
   }

   #cacheTopology(): void {
      if (!this.#hwmon) return

      try {
         for (let i = 0; i <= this.#processorsNum - 1; i++) {
            const coreId = +readFile(`/sys/devices/system/cpu/cpu${i}/topology/core_id`)
            const dieId = +readFile(`/sys/devices/system/cpu/cpu${i}/topology/die_id`)

            this.#topology.set(`cpu${i}`, { coreId: coreId, dieId: dieId })
         }
      } catch (err) {
         logServiceError("Failed to cache CPU topology.", err)
         this.#topology.clear()
      }
   }

   async #readCoreFreq(name: string): Promise<number> {
      try {
         const path = `/sys/devices/system/cpu/${name}/cpufreq/scaling_cur_freq`
         const content = await readFileAsync(path)

         return Math.round(+content.trim() * 0.001)
      } catch (err) {
         logServiceError(`Failed to read ${name} frequency.`, err)
         return -1
      }
   }

   async #readPackageTemp(): Promise<number> {
      if (!this.#hwmon) return -1

      try {
         const content = await readFileAsync(`${this.#hwmon}/temp1_input`)
         return +content.trim().slice(0, -3)
      } catch (err) {
         logServiceError("Failed to read CPU package temperature.", err)
         return -1
      }
   }

   async #readIntelCoreTemp(name: string): Promise<number> {
      try {
         const coreId = this.#topology.get(name)?.coreId

         if (coreId) {
            const sensorId = coreId + 2
            const content = await readFileAsync(`${this.#hwmon}/temp${sensorId}_input`)

            return +content.trim().slice(0, -3)
         }

         return -1
      } catch (err) {
         logServiceError(`Failed to read ${name} temperature`, err)
         return -1
      }
   }

   async #readK10TempCoreTemp(name: string): Promise<number> {
      let dieId: number | undefined = undefined

      try {
         dieId = this.#topology.get(name)?.dieId

         if (dieId) {
            dieId = dieId
            const sensorId = dieId + 3
            const content = await readFileAsync(`${this.#hwmon}/temp${sensorId}_input`)

            return +content.trim().slice(0, -3)
         }

         return -1
      } catch (err) {
         logServiceError(`Failed to read ${name} (die ${dieId}) temperature`, err)
         return -1
      }
   }

   async #readZenpowerCoreTemp(name: string): Promise<number> {
      // TODO
      return -1
   }

   // Since Intel and AMD have different CPU topologies,
   // we need a different approach to read an individual core temperature.
   // Intel has temperature sensors tied to core IDs.
   // AMD ties sensors to CCD (Core Complex Die) IDs because of the chiplet physical design.
   async #readCoreTemp(name: string): Promise<number> {
      if (!this.#hwmon || this.#driver === "Unknown") return -1

      switch (this.#driver) {
         case HwmonDriver.CORETEMP:
            return this.#readIntelCoreTemp(name)

         case HwmonDriver.K10TEMP:
            return this.#readK10TempCoreTemp(name)

         case HwmonDriver.ZENPOWER:
            return this.#readZenpowerCoreTemp(name)

         default:
            return -1
      }
   }

   async #readPackagePower(): Promise<number> {
      // TODO
      return -1
   }

   async #update(): Promise<void> {
      try {
         const content = await readFileAsync("/proc/stat")
         const lines = content.split("\n").filter((line) => line.startsWith("cpu"))

         const cores = lines.map(async (line) => {
            const values = line.split(/\s+/)

            let usagePercent = -1
            let freq = -1
            let temp = -1

            const name = values[0]
            const user = +values[1]
            const nice = +values[2]
            const system = +values[3]
            const idle = +values[4]

            const total = user + nice + system + idle

            const previous = this.#history.get(name)

            if (previous) {
               usagePercent = countUsage(idle - previous.idle, total - previous.total)
            }

            this.#history.set(name, { total: total, idle: idle })

            // Get frequency and temperature for an individual logic core (cpuX)
            // For the whole cpu write its usage in the dedicated class property
            if (name === "cpu") {
               this.#usagePercent = usagePercent
            } else {
               freq = await this.#readCoreFreq(name)
               temp = await this.#readCoreTemp(name)
            }

            return { name, usagePercent, freq, temp }
         })

         this.#cores = await Promise.all(cores)
         this.#cores.shift() // remove "cpu" named core from the list as it represents the whole cpu
         this.#packageTemp = await this.#readPackageTemp()

         this.notify("cores")
         this.notify("usage-percent")
         this.notify("package-temp")
      } catch (err) {
         logServiceError("Failed to read /proc/stat.", err)
      }
   }
}

function logServiceError(context: string, err: unknown): void {
   logError(err as any, `CPU Service [ERROR]: ${context}`)
}

function countUsage(deltaIdle: number, deltaTotal: number): number {
   if (deltaTotal > 0) {
      return Math.round((1 - deltaIdle / deltaTotal) * 100)
   }

   return -1
}
