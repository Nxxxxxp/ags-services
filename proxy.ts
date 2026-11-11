export const NOT_AVAIL_STRING = "N/A"
export const NOT_AVAIL_NUM = -1

export function createProxy<T extends object>(
   target: T | null | undefined,
   fallbackValues: {
      string?: string
      number?: number
      boolean?: boolean
      [key: string]: any
   } = { string: NOT_AVAIL_STRING, number: NOT_AVAIL_NUM },
   numericFiedls: string[] = [],
): T {
   const numSet = new Set(numericFiedls)

   return new Proxy(target ?? ({} as T), {
      get(obj, prop: string) {
         if (obj && prop in obj && (obj as any)[prop] !== undefined && (obj as any)[prop] !== null) {
            return (obj as any)[prop]
         }

         if (prop in fallbackValues) {
            return fallbackValues[prop]
         }

         if (numSet.has(prop)) {
            return fallbackValues.number ?? NOT_AVAIL_NUM
         }

         return fallbackValues.string ?? NOT_AVAIL_STRING
      },
   })
}
