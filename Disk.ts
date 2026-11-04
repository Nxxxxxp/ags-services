import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { getter, register } from "gnim/gobject"

interface FsInfo {
   size: number
   free: number
}

const FS_FREE = Gio.FILE_ATTRIBUTE_FILESYSTEM_FREE
const FS_SIZE = Gio.FILE_ATTRIBUTE_FILESYSTEM_SIZE

@register({ GTypeName: "Disk", GTypeFlags: GObject.TypeFlags.NONE })
export default class Disk extends GObject.Object {
   static #instance: Disk

   static get default(): Disk {
      return (this.#instance ||= new Disk())
   }

   static toTB(bytes: number, precision: number = 0): number {
      return +(bytes / 1024 ** 4).toFixed(precision)
   }

   static toGB(bytes: number, precision: number = 0): number {
      return +(bytes / 1024 ** 3).toFixed(precision)
   }

   static toMB(bytes: number, precision: number = 0): number {
      return +(bytes / 1024 ** 2).toFixed(precision)
   }

   static toKB(bytes: number, precision: number = 0): number {
      return +(bytes / 1024).toFixed(precision)
   }

   @getter(Number) get rootSize() {
      return this.#rootSize
   }

   @getter(Number) get rootFree() {
      return this.#rootFree
   }

   @getter(Number) get rootUsed() {
      return this.#rootSize - this.#rootFree
   }

   @getter(Number) get rootUsedPercent() {
      if (this.#rootSize === 0) return 0
      return Math.round((this.rootUsed / this.#rootSize) * 100)
   }

   @getter(Number) get homeSize() {
      return this.#homeSize
   }

   @getter(Number) get homeFree() {
      return this.#homeFree
   }

   @getter(Number) get homeUsed() {
      return this.#homeSize - this.#homeFree
   }

   @getter(Number) get homeUsedPercent() {
      if (this.#homeSize === 0) return 0
      return Math.round((this.homeUsed / this.#homeSize) * 100)
   }

   constructor() {
      super()

      GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
         this.#update()
         return GLib.SOURCE_REMOVE
      })

      GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
         this.#update()
         return GLib.SOURCE_CONTINUE
      })
   }

   #rootSize: number = 0
   #homeSize: number = 0
   #rootFree: number = 0
   #homeFree: number = 0

   async #update(): Promise<void> {
      const root = await this.#queryFsInfo("/")
      const home = await this.#queryFsInfo("/home")

      if (this.#rootSize !== root.size) {
         this.#rootSize = root.size
         this.notify("root-size")
      }

      if (this.#homeSize !== home.size) {
         this.#homeSize = home.size
         this.notify("home-size")
      }

      if (this.#rootFree !== root.free) {
         this.#rootFree = root.free
         this.notify("root-free")
         this.notify("root-used")
         this.notify("root-used-percent")
      }

      if (this.#homeFree !== home.free) {
         this.#homeFree = home.free
         this.notify("home-free")
         this.notify("home-used")
         this.notify("home-used-percent")
      }
   }

   async #queryFsInfo(path: "/" | "/home"): Promise<FsInfo> {
      try {
         const file = Gio.File.new_for_path(path)

         const info = await new Promise<Gio.FileInfo>((resolve, reject) => {
            file.query_filesystem_info_async(`${FS_SIZE},${FS_FREE}`, GLib.PRIORITY_DEFAULT, null, (src, res) => {
               try {
                  resolve(src!.query_filesystem_info_finish(res))
               } catch (err) {
                  reject(err)
               }
            })
         })

         const size = info.get_attribute_uint64(FS_SIZE)
         const free = info.get_attribute_uint64(FS_FREE)

         return { size, free }
      } catch (err) {
         printerr(`Disk Service [ERROR]: Failed to query filesystem info for path ${path}. ${err}`)
         return { size: 0, free: 0 }
      }
   }
}
