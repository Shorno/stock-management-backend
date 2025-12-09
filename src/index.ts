import { Hono } from 'hono'
import auth from "./modules/auth/routes"

const app = new Hono().basePath("/api")

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.route("/auth", auth)

export default app
