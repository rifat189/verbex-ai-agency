import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db.js";
import { users } from "./schema.js";

const JWT_SECRET = process.env.JWT_SECRET!;

export async function signup(email: string, password: string) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) throw new Error("Email already in use");

  const hashed = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({ email, password: hashed })
    .returning();

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
  return { token };
}

export async function login(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) throw new Error("Invalid credentials");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error("Invalid credentials");

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
  return { token };
}

export function verifyToken(token: string) {
  const payload = jwt.verify(token, JWT_SECRET) as {
    userId: string;
    email: string;
  };
  return { userId: payload.userId, email: payload.email };
}
