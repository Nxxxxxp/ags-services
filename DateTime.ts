import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { getter, register } from "gnim/gobject"

const INTERVAL = 1

const WEEK_DAYS = {
   1: ["Monday", "Mon"],
   2: ["Tuesday", "Tue"],
   3: ["Wednesday", "Wed"],
   4: ["Thursday", "Thu"],
   5: ["Friday", "Fri"],
   6: ["Saturday", "Sat"],
   7: ["Sunday", "Sun"],
} as const

const MONTHS = {
   1: ["January", "Jan"],
   2: ["February", "Feb"],
   3: ["March", "Mar"],
   4: ["April", "Apr"],
   5: ["May", "May"],
   6: ["June", "Jun"],
   7: ["July", "Jul"],
   8: ["August", "Aug"],
   9: ["September", "Sep"],
   10: ["October", "Oct"],
   11: ["November", "Nov"],
   12: ["December", "Dec"],
} as const

type WeekDayNum = keyof typeof WEEK_DAYS
type MonthNum = keyof typeof MONTHS

@register({ GTypeName: "DateTime", GTypeFlags: GObject.TypeFlags.NONE })
export default class DateTime extends GObject.Object {
   static #instance: DateTime | null = null

   static get default(): DateTime {
      return (this.#instance ||= new DateTime())
   }

   static formatTwoDigits(digit: number): string {
      return digit.toString().padStart(2, "0")
   }

   static get clock(): string {
      const t = this.default
      const format = this.formatTwoDigits
      return `${format(t.hour)}:${format(t.minute)}`
   }

   static toFullMonthName(month: number): string {
      if (month < 1 || month > 12) return "Unknown"
      return MONTHS[month as MonthNum][0]
   }

   static toShortMonthName(month: number): string {
      if (month < 1 || month > 12) return "Unknown"
      return MONTHS[month as MonthNum][1]
   }

   static toFullDayOfWeekName(day: number): string {
      if (day < 1 || day > 7) return "Unknown"
      return WEEK_DAYS[day as WeekDayNum][0]
   }

   static toShortDayOfWeekName(day: number): string {
      if (day < 1 || day > 7) return "Unknown"
      return WEEK_DAYS[day as WeekDayNum][1]
   }

   static getRelativeDay(currentDay: number, offset: number): number {
      const now = GLib.DateTime.new_now_local()
      const relative = now.add_days(offset)

      return relative?.get_day_of_month() ?? 1
   }

   @getter(Number) get second() {
      return this.#second
   }

   @getter(Number) get minute() {
      return this.#minute
   }

   @getter(Number) get hour() {
      return this.#hour
   }

   @getter(Number) get day() {
      return this.#day
   }

   @getter(Number) get dayOfWeek() {
      return this.#dayOfWeek
   }

   @getter(Number) get week() {
      return this.#week
   }

   @getter(Number) get month() {
      return this.#month
   }

   @getter(Number) get year() {
      return this.#year
   }

   constructor() {
      super()

      this.#update()

      GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, INTERVAL, () => {
         this.#update()
         return GLib.SOURCE_CONTINUE
      })
   }

   #second: number = 0
   #minute: number = 0
   #hour: number = 0
   #day: number = 0
   #dayOfWeek: number = 0
   #week: number = 0
   #month: number = 0
   #year: number = 0

   #update() {
      const now = GLib.DateTime.new_now_local()

      const second = now.get_seconds() ?? 0
      const minute = now.get_minute() ?? 0
      const hour = now.get_hour() ?? 0
      const day = now.get_day_of_month() ?? 0
      const dayOfWeek = now.get_day_of_week() ?? 0
      const week = now.get_week_of_year() ?? 0
      const month = now.get_month() ?? 0
      const year = now.get_year() ?? 0

      if (this.#second !== second) {
         this.#second = second
         this.notify("second")
      }

      if (this.#minute !== minute) {
         this.#minute = minute
         this.notify("minute")
      }

      if (this.#hour !== hour) {
         this.#hour = hour
         this.notify("hour")
      }

      if (this.#day !== day) {
         this.#day = day
         this.notify("day")
      }

      if (this.#dayOfWeek !== dayOfWeek) {
         this.#dayOfWeek = dayOfWeek
         this.notify("day-of-week")
      }

      if (this.#week !== week) {
         this.#week = week
         this.notify("week")
      }

      if (this.#month !== month) {
         this.#month = month
         this.notify("month")
      }

      if (this.#year !== year) {
         this.#year = year
         this.notify("year")
      }
   }
}
