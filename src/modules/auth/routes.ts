import {Hono} from "hono";
import {zValidator} from "@hono/zod-validator";
import {loginFormSchema} from "./authSchema";

const app = new Hono();

app.post("/login", zValidator("json", loginFormSchema, (result, ctx) => {
    if (!result.success){
        return ctx.json({
            success: false,
            message: "Validation failed",
            errors: result.error.issues.map((issue) => issue.message)
        }, 400)
    }
}), (ctx) => {


    const {email,password} = ctx.req.valid("json");


    return ctx.json({success: true,
        message: `Logged in as ${email}`,
    });



})

export default app