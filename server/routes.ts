import { Express } from "express";
import { Server } from "http";

export async function registerRoutes(app: Express): Promise<Server> {
  // API routes will be added here
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return {} as Server;
}