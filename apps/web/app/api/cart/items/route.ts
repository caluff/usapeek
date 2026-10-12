import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { addCartItem, isSameOriginCartRequest } from "@/features/cart/add-item"
import { CART_COOKIE, cartSdk } from "@/features/cart/data"
import { cookieOptions, failure } from "@/features/cart/server-state"
import { getStorefrontRegion } from "@/lib/medusa"

export async function POST(request: Request) {
  if (!isSameOriginCartRequest(request))
    return Response.json({ error: "Solicitud no permitida." }, { status: 403 })
  if (
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
    "application/json"
  )
    return Response.json({ error: "Solicitud no válida." }, { status: 415 })

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return Response.json({ error: "Solicitud no válida." }, { status: 400 })
  }
  try {
    const store = await cookies()
    const result = await addCartItem(input, {
      sdk: await cartSdk(),
      cartId: store.get(CART_COOKIE)?.value,
      getRegion: getStorefrontRegion,
      persistCartId: (id) => store.set(CART_COOKIE, id, cookieOptions),
    })
    revalidatePath("/cart")
    revalidatePath("/checkout")
    return Response.json(result)
  } catch (error) {
    return Response.json(failure(error), { status: 400 })
  }
}
