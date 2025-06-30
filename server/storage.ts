import { User, InsertUser } from "@shared/schema";

export interface IStorage {
  // Add your storage methods here as needed
  getHealthStatus(): Promise<{ status: string; timestamp: string }>;
}

export class MemStorage implements IStorage {
  constructor() {
    // Initialize in-memory storage
  }

  async getHealthStatus(): Promise<{ status: string; timestamp: string }> {
    return {
      status: "ok",
      timestamp: new Date().toISOString()
    };
  }
}

export const storage = new MemStorage();