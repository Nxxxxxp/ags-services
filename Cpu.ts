import GLib from "gi://GLib?version=2.0"
import GObject, { getter, register } from "gnim/gobject"
import { readFile, readFileAsync } from "ags/file"

interface CoreData {
   name: string
   usage: number
   freq: number
   temp: number
}

const UPDATE_INTERVAL_SECONDS = 1

@register({ GTypeName: "Cpu", GTypeFlags: GObject.TypeFlags.NONE })
export default class Cpu extends GObject.Object {
   static #instance: Cpu | null = null

   static get default(): Cpu {
      return (this.#instance ||= new Cpu())
   }

   @getter(Number) get usage() {
      return this.#usage
   }

   @getter(Number) get packageTemp() {
      return this.#packageTemp
   }

   @getter(Object) get cores() {
      return this.#cores
   }

   constructor() {
      super()

      GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
         this.#cacheHwmonPath()
         this.#cacheTopology()
         this.#update()

         return GLib.SOURCE_REMOVE
      })

      GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, UPDATE_INTERVAL_SECONDS, () => {
         this.#update()

         return GLib.SOURCE_CONTINUE
      })
   }

   #cores: CoreData[] = []
   #coresNum: number = GLib.get_num_processors()
   #usage: number = -1
   #packageTemp: number = -1

   #hwmon: string | null = null
   #topology = new Map<string, number>()
   #history = new Map<string, { total: number; idle: number }>()

   #cacheHwmonPath(): void {
      for (let i = 0; i <= 9; i++) {
         try {
            const content = readFile(`/sys/class/hwmon/hwmon${i}/name`)
            const name = content.trim()

            if (name === "coretemp" || name === "k10temp" || name === "zenpower") {
               this.#hwmon = `/sys/class/hwmon/hwmon${i}`
               return
            }
         } catch (err) {
            console.log("CPU Service [ERROR]: Failed to find hwmon path. ", err)
            this.#hwmon = null
         }
      }
   }

   #cacheTopology(): void {
      if (!this.#hwmon) return

      try {
         for (let i = 0; i <= this.#coresNum - 1; i++) {
            const name = `cpu${i}`
            const coreId = +readFile(`/sys/devices/system/cpu/${name}/topology/core_id`)
            this.#topology.set(name, coreId)
         }
      } catch (err) {
         console.log("CPU Service [ERROR]: Failed to cache topology. ", err)
         this.#topology.clear()
      }
   }

   async #readPackageTemp(): Promise<number> {
      if (!this.#hwmon) return -1

      try {
         const content = await readFileAsync(`${this.#hwmon}/temp1_input`)
         return +content.trim().slice(0, -3)
      } catch (err) {
         console.error(`CPU Service [ERROR]: Failed to read package temperature. `, err)
         return -1
      }
   }

   async #readCoreTemp(name: string): Promise<number> {
      if (!this.#hwmon) return -1

      try {
         const coreId = this.#topology.get(name)

         if (typeof coreId === "number") {
            const sensorId = coreId + 2
            const content = await readFileAsync(`${this.#hwmon}/temp${sensorId}_input`)
            return +content.trim().slice(0, -3)
         }

         return -1
      } catch (err) {
         console.error(`CPU Service [ERROR]: Failed to read ${name} temperature. `, err)
         return -1
      }
   }

   async #readCoreFreq(name: string): Promise<number> {
      try {
         const path = `/sys/devices/system/cpu/${name}/cpufreq/scaling_cur_freq`
         const content = await readFileAsync(path)
         return Math.round(+content.trim() * 0.001)
      } catch (err) {
         console.error(`CPU Service [ERROR]: Failed to read ${name} frequency. `, err)
         return -1
      }
   }

   async #update(): Promise<void> {
      try {
         const content = await readFileAsync("/proc/stat")
         const lines = content.split("\n").filter((line) => line.startsWith("cpu"))

         const cores = lines.map(async (line) => {
            const values = line.split(/\s+/)

            let usage = -1
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
               usage = countUsage(idle - previous.idle, total - previous.total)
            }

            this.#history.set(name, { total: total, idle: idle })

            if (name === "cpu") {
               this.#usage = usage // show "cpu" usage as cpu object prop
            } else {
               freq = await this.#readCoreFreq(name)
               temp = await this.#readCoreTemp(name)
            }

            return { name, usage, freq, temp }
         })

         this.#cores = await Promise.all(cores)
         this.#cores.shift() // remove "cpu" named core as it represents the whole cpu
         this.#packageTemp = await this.#readPackageTemp()

         this.notify("cores")
         this.notify("usage")
         this.notify("package-temp")
      } catch (err) {
         console.error("CPU Service [ERROR]: Failed to update core info. ", err)
      }
   }
}

function countUsage(deltaIdle: number, deltaTotal: number): number {
   if (deltaTotal > 0) {
      return Math.round((1 - deltaIdle / deltaTotal) * 100)
   }

   return -1
}
