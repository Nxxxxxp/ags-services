/**
 * @author Vladislav Stepanov
 * @copyright Copyright (C) 2026
 * @link https://github.com/Nxxxxxp
 * @license MIT
 */

import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { getter, register } from "gnim/gobject"
import { readFile, readFileAsync } from "ags/file"

interface LogicalCpuData {
   name: string // e.g. (cpu0)
   usage: number // percent (0-100)
   freq: number // mhz
   temp: number // celsius
}

interface LogicalCpuTopology {
   coreId: number
   dieId: number
}

const CPUINFO_FILE = Gio.File.new_for_path("/proc/cpuinfo")
const STAT_FILE = Gio.File.new_for_path("/proc/stat")

const HwmonDriver = {
   CORETEMP: "coretemp",
   K10TEMP: "k10temp",
   ZENPOWER: "zenpower",
} as const

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
      if (!this.#instance) this.#instance = new Cpu()

      return this.#instance
   }

   /**
    * Vendor name (Intel, AMD).
    * @returns {string} CPU vendor name.
    */
   @getter(String) get vendor() {
      return this.#vendor ?? "N/A"
   }

   /**
    * Hwmon driver name (coretemp, k10temp, zenpower).
    * @returns {string} CPU hwmon driver name.
    */
   @getter(String) get driver() {
      return this.#driver ?? "N/A"
   }

   /**
    * Commercial CPU model name (e.g. 12th Gen Intel Core i5-12600KF).
    * @returns {string} CPU model name.
    */
   @getter(String) get modelName() {
      return this.#modelName ?? "N/A"
   }

   /**
    * CPU usage percentage (0-100).
    * @returns {number} CPU usage in percent.
    */
   @getter(Number) get usage() {
      return this.#usage ?? -1
   }

   /**
    * CPU package temperature representing the resulting temperature
    * from core dies, SMD components, thermal interface, and substrate (in degrees Celsius).
    * @returns {number} CPU package temperature in degrees Celsius.
    */
   @getter(Number) get packageTemp() {
      return this.#packageTemp ?? -1
   }

   /**
    * Number of physical CPU cores.
    * @returns {number} CPU cores number.
    */
   @getter(Number) get coresNum() {
      return this.#coresNum ?? -1
   }

   /**
    * Number of logical CPU cores.
    * @returns {number} CPU logical cores number.
    */
   @getter(Number) get processorsNum() {
      return this.#processorsNum ?? -1
   }

   /**
    * CPU individual logical cores metrics (name, usage, frequency, temperature).
    * @returns {Array} CPU logical cores data.
    */
   @getter(Array) get cores() {
      return this.#cores
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
      if (value >= 0 && this.#updateInterval !== value) {
         this.#updateInterval = value
         this.notify("update-interval")

         this.#start()
      }
   }

   constructor() {
      super()

      GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
         this.#cacheStaticInfo()
         this.#cacheHwmonPath()
         this.#cacheTopology()
         this.#cacheFiles()

         this.#update()

         return GLib.SOURCE_REMOVE
      })

      this.#start()
   }

   #timerId: number | null = null
   #hwmon: string | null = null
   #topology = new Map<string, LogicalCpuTopology>()
   #history = new Map<string, { total: number; idle: number }>()
   #freqFiles = new Map<string, Gio.File>()
   #tempFiles = new Map<string, Gio.File>()
   #packageTempFile: Gio.File | null = null

   #vendor: string | null = null
   #driver: string | null = null
   #modelName: string | null = null
   #usage: number | null = null
   #packageTemp: number | null = null
   #coresNum: number | null = null
   #processorsNum: number | null = null
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
         const content = readFile(CPUINFO_FILE)
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
         logErr("Failed to read /proc/cpuinfo.", err)

         this.#vendor = null
         this.#modelName = null
         this.#coresNum = null
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
            logErr("Failed to cache CPU hwmon path.", err)
            this.#hwmon = null
            this.#driver = null
         }
      }
   }

   #cacheTopology(): void {
      if (!this.#hwmon || !this.#processorsNum) return

      try {
         for (let i = 0; i < this.#processorsNum; i++) {
            const name = `cpu${i}`

            const coreId = +readFile(`/sys/devices/system/cpu/${name}/topology/core_id`)
            const dieId = +readFile(`/sys/devices/system/cpu/${name}/topology/die_id`)

            this.#topology.set(name, { coreId: coreId, dieId: dieId })
         }
      } catch (err) {
         logErr("Failed to cache CPU topology.", err)
         this.#topology.clear()
      }
   }

   #cacheFiles(): void {
      if (this.#hwmon) {
         this.#packageTempFile = Gio.File.new_for_path(`${this.#hwmon}/temp1_input`)
      }

      if (!this.#processorsNum) return

      for (let i = 0; i < this.#processorsNum; i++) {
         const name = `cpu${i}`
         const freqPath = `/sys/devices/system/cpu/${name}/cpufreq/scaling_cur_freq`

         this.#freqFiles.set(name, Gio.File.new_for_path(freqPath))

         if (this.#hwmon && this.#driver) {
            let sensorPath: string | null = null

            switch (this.#driver) {
               case HwmonDriver.CORETEMP:
                  const coreId = this.#topology.get(name)?.coreId

                  if (coreId !== undefined) {
                     sensorPath = `${this.#hwmon}/temp${coreId + 2}_input`
                  }

                  break
               case HwmonDriver.K10TEMP:
                  const dieId = this.#topology.get(name)?.dieId

                  if (dieId !== undefined) {
                     sensorPath = `${this.#hwmon}/temp${dieId + 3}_input`
                  }

                  break
               case HwmonDriver.ZENPOWER:
                  // TODO:
                  break
               default:
                  break
            }

            if (sensorPath) {
               this.#tempFiles.set(name, Gio.File.new_for_path(sensorPath))
            }
         }
      }
   }

   async #readCoreFreq(name: string): Promise<number | null> {
      try {
         const file = this.#freqFiles.get(name)
         if (!file) return null

         const content = await readFileAsync(file)

         return Math.round(+content.trim() / 1000)
      } catch (err) {
         logErr(`Failed to read ${name} frequency.`, err)
         return null
      }
   }

   async #readPackageTemp(): Promise<number | null> {
      if (!this.#packageTempFile) return null

      try {
         const content = await readFileAsync(this.#packageTempFile)

         return +content.trim().slice(0, -3)
      } catch (err) {
         logErr("Failed to read CPU package temperature.", err)
         return null
      }
   }

   async #readCoreTemp(name: string): Promise<number | null> {
      if (!this.#hwmon || !this.#driver) return null

      try {
         const file = this.#tempFiles.get(name)
         if (!file) return null

         const content = await readFileAsync(file)

         return +content.trim().slice(0, -3)
      } catch (err) {
         logErr(`Failed to read ${name} temperature`, err)
         return null
      }
   }

   async #readZenpowerCoreTemp(name: string): Promise<number | null> {
      // TODO:
      return null
   }

   async #readPackagePower(): Promise<number | null> {
      // TODO:
      return null
   }

   async #update(): Promise<void> {
      try {
         const content = await readFileAsync(STAT_FILE)
         const lines = content.split("\n").filter((line) => line.startsWith("cpu"))

         const cores = lines.map(async (line) => {
            const values = line.split(/\s+/)

            let usage: number = -1
            let freq: number = -1
            let temp: number = -1

            const name = values[0]
            const user = +values[1]
            const nice = +values[2]
            const system = +values[3]
            const idle = +values[4]

            const total = user + nice + system + idle

            const previous = this.#history.get(name)

            if (previous) {
               usage = calculateUsage(idle - previous.idle, total - previous.total)
            }

            this.#history.set(name, { total: total, idle: idle })

            // Get frequency and temperature for an individual logic core (cpuX)
            // For the whole cpu write its usage in the dedicated class property
            if (name === "cpu") {
               this.#usage = usage
            } else {
               freq = (await this.#readCoreFreq(name)) ?? -1
               temp = (await this.#readCoreTemp(name)) ?? -1
            }

            return { name, usage, freq, temp }
         })

         this.#cores = await Promise.all(cores)
         this.#cores.shift() // remove "cpu" named core from the list as it represents the whole cpu
         this.#packageTemp = await this.#readPackageTemp()

         this.notify("cores")
         this.notify("usage")
         this.notify("package-temp")
      } catch (err) {
         logErr("Failed to read /proc/stat.", err)
      }
   }
}

function logErr(context: string, err: unknown): void {
   logError(err as any, `CPU Service [ERROR]: ${context}`)
}

const calculateUsage = (deltaIdle: number, deltaTotal: number): number => {
   if (deltaTotal > 0) {
      return Math.round((1 - deltaIdle / deltaTotal) * 100)
   }

   return -1
}
