import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { register, getter } from "gnim/gobject"
import { exec } from "ags/process"
import { readFile } from "ags/file"

const UPDATE_INTERVAL_SECONDS = 1

const enum VendorCode {
   NVIDIA = "0x10de",
   AMD = "0x1002",
   INTEL = "0x8086",
   UNKNOWN = "0x0000",
}

@register({ GTypeName: "Gpu", GTypeFlags: GObject.TypeFlags.NONE })
export default class Gpu extends GObject.Object {
   static #instance: Gpu | null = null

   static get default() {
      return (this.#instance ||= new Gpu())
   }

   @getter(String) get modelName() {
      return this.#modelName
   }

   private set modelName(value: string) {
      if (this.#modelName !== value) {
         this.#modelName = value
         this.notify("model-name")
      }
   }

   @getter(Number) get utilization() {
      return Number(this.#utilization)
   }

   private set utilization(value: number) {
      if (this.#utilization !== value) {
         this.#utilization = value
         this.notify("utilization")
      }
   }

   @getter(Number) get powerDraw() {
      return Number(this.#powerDraw)
   }

   private set powerDraw(value: number) {
      if (this.#powerDraw !== value) {
         this.#powerDraw = value
         this.notify("power-draw")
      }
   }

   @getter(Number) get temperature() {
      return Number(this.#temperature)
   }

   private set temperature(value: number) {
      if (this.#temperature !== value) {
         this.#temperature = value
         this.notify("temperature")
      }
   }

   @getter(Number) get memUsed() {
      return Number(this.#memUsed)
   }

   private set memUsed(value: number) {
      if (this.#memUsed !== value) {
         this.#memUsed = value
         this.notify("mem-used")
      }
   }

   @getter(Number) get memTotal() {
      return Number(this.#memTotal)
   }

   private set memTotal(value: number) {
      if (this.#memTotal !== value) {
         this.#memTotal = value
         this.notify("mem-total")
      }
   }

   @getter(Number) get graphicsClock() {
      return Number(this.#graphicsClock)
   }

   private set graphicsClock(value: number) {
      if (this.#graphicsClock !== value) {
         this.#graphicsClock = value
         this.notify("graphics-clock")
      }
   }

   @getter(Number) get memClock() {
      return Number(this.#memClock)
   }

   private set memClock(value: number) {
      if (this.#memClock !== value) {
         this.#memClock = value
         this.notify("mem-clock")
      }
   }

   @getter(Number) get smClock() {
      return Number(this.#smClock)
   }

   private set smClock(value: number) {
      if (this.#smClock !== value) {
         this.#smClock = value
         this.notify("sm-clock")
      }
   }

   @getter(Number) get memPercentage() {
      return !this.#memTotal || !this.#memUsed ? 0 : Math.round((this.#memUsed / this.#memTotal) * 100)
   }

   constructor() {
      super()

      this.#vendorCode = this.#detectVendor()

      if (this.#vendorCode === VendorCode.NVIDIA) {
         this.#getNvidiaStaticDriverInfo()
         this.#updateNvidiaDriverInfo()
      } else if (this.#vendorCode === VendorCode.AMD) {
         // TODO:
      } else if (this.#vendorCode === VendorCode.INTEL) {
         // TODO:
      } else return
   }

   #vendorCode: string = VendorCode.UNKNOWN
   #modelName: string = "Unknown"
   #utilization: number | null = null
   #powerDraw: number | null = null
   #temperature: number | null = null
   #memUsed: number | null = null
   #memTotal: number | null = null
   #graphicsClock: number | null = null
   #memClock: number | null = null
   #smClock: number | null = null

   #subproc: Gio.Subprocess | null = null
   #cancellable: Gio.Cancellable | null = null

   // cleanup nvidia-smi subprocess on GObject "destroy"
   vfunc_dispose(): void {
      if (this.#vendorCode === VendorCode.NVIDIA) {
         try {
            if (this.#cancellable && !this.#cancellable.is_cancelled()) {
               this.#cancellable.cancel()
            }

            if (this.#subproc) {
               this.#subproc.force_exit()
            }

            console.log("GPU Service [WARNING]: nvidia-smi subprocess successfully stopped")
         } catch (err) {
            console.error("GPU Service [ERROR]: Resources will be cleaned regardless: ", err)
         } finally {
            this.#subproc = null
            this.#cancellable = null
         }
      }

      super.vfunc_dispose()
   }

   #detectVendor(): string {
      try {
         return readFile("/sys/class/drm/card1/device/vendor").trim()
      } catch (err) {
         console.error("GPU Service [ERROR]: Failed to define GPU vendor: ", err)
         return VendorCode.UNKNOWN
      }
   }

   #updateNvidiaDriverInfo(): void {
      this.#cancellable = Gio.Cancellable.new()

      try {
         const argv = [
            "nvidia-smi",
            "--query-gpu=utilization.gpu,power.draw,temperature.gpu,memory.used,clocks.current.graphics,clocks.current.memory,clocks.current.sm",
            "--format=csv,noheader,nounits",
            "-l",
            `${UPDATE_INTERVAL_SECONDS}`,
         ]

         const flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE

         this.#subproc = Gio.Subprocess.new(argv, flags)

         const pipe = this.#subproc.get_stdout_pipe()

         if (pipe) {
            const stream = Gio.DataInputStream.new(pipe)
            this.#readStreamLine(stream)
         }
      } catch (err) {
         console.error("GPU Service [ERROR]: Failed to start nvidia-smi subrocess, exiting now: ", err)
         this.#cancellable.cancel()
         this.#subproc?.force_exit()
      }
   }

   #readStreamLine(stream: Gio.DataInputStream): void {
      stream.read_line_async(GLib.PRIORITY_DEFAULT, this.#cancellable, (_src, res, _data) => {
         try {
            const [line, _length] = stream.read_line_finish_utf8(res)

            if (line) {
               if (line.includes("Failed")) {
                  console.log("GPU Service [ERROR]: NVLM error occured. Try to restart your PC: ", line)

                  this.#cancellable?.cancel()
                  this.#subproc?.force_exit()

                  return
               }

               const [util, power, temp, memUsed, gClock, memClock, smClock] = line.trim().split(", ").map(Number)

               this.utilization = util
               this.powerDraw = power
               this.temperature = temp
               this.graphicsClock = gClock
               this.smClock = smClock
               this.memUsed = memUsed
               this.memClock = memClock

               this.#readStreamLine(stream)
            }
         } catch (err) {
            if (this.#cancellable && !this.#cancellable.is_cancelled()) {
               console.error("GPU Service [ERROR]: Failed to read NVIDIA driver info: ", err)
               this.#readStreamLine(stream)
            }
         }
      })
   }

   #getNvidiaStaticDriverInfo(): void {
      try {
         const stdout = exec(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
         const [name, memTotal] = stdout.trim().split(", ")

         this.modelName = name
         this.memTotal = Number(memTotal)
      } catch (err) {
         this.#modelName = "Unknown"
         this.#memTotal = 0

         console.error("GPU Service [ERROR]: Failed to read NVIDIA driver info: ", err)
      }
   }
}
