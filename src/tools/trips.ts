import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { withTripIt } from "../client";
import { jsonResult } from "../results";

export function registerTripTools(server: McpServer): void {
  server.registerTool(
    "tripit_trips_list",
    {
      title: "TripIt Trips List",
      description: "List trips in the authenticated TripIt account. Set includeDetails=true to include full itineraries with flight numbers, confirmation numbers, lodging, and other reservations. Otherwise returns trip summaries; use tripit_trips_get for a selected trip's full details.",
      inputSchema: {
        pageSize: z.number().int().positive().optional().describe("Number of trips to return. Defaults to 100."),
        pageNum: z.number().int().positive().optional().describe("Page number to fetch. Defaults to 1."),
        past: z.boolean().optional().describe("When true, list past trips instead of current/future trips."),
        includeDetails: z.boolean().optional().describe("Fetch full itinerary objects for each trip, including flight numbers and booking confirmations. Defaults to false. Use a small pageSize when requesting details."),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ pageSize, pageNum, past, includeDetails }) =>
      jsonResult(await withTripIt(async (client) => {
        const result = await client.listTrips(pageSize ?? 100, pageNum ?? 1, past ?? false) as Record<string, unknown>;
        if (!includeDetails || !result.Trip) return result;
        const trips = Array.isArray(result.Trip) ? result.Trip : [result.Trip];
        const details: unknown[] = [];
        for (const trip of trips) {
          const id = trip.uuid ?? trip.id;
          if (!id) throw new Error("TripIt returned a trip without an ID or UUID; cannot fetch its itinerary.");
          details.push(await client.getTrip(String(id)));
        }
        return { ...result, tripDetails: details };
      })),
  );

  server.registerTool(
    "tripit_trips_get",
    {
      title: "TripIt Trips Get",
      description: "Get a trip's full itinerary by TripIt ID or UUID, including flight numbers, booking and supplier confirmation numbers, flight segments, lodging, and other reservation objects when present in TripIt. Use this after tripit_trips_list to retrieve details for a selected trip.",
      inputSchema: {
        id: z.string().min(1).describe("Trip ID or UUID."),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ id }) => jsonResult((await withTripIt((client) => client.getTrip(id))) as Record<string, unknown>),
  );

  server.registerTool(
    "tripit_trips_create",
    {
      title: "TripIt Trips Create",
      description: "Create a new trip.",
      inputSchema: {
        name: z.string().min(1).describe("Trip display name."),
        start: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start date or today."),
        location: z.string().optional().describe("Primary location for the trip."),
      },
    },
    async ({ name, start, end, location }) => {
      const today = new Date().toISOString().slice(0, 10);
      return jsonResult(
        (await withTripIt((client) =>
          client.createTrip({
            displayName: name,
            startDate: start ?? today,
            endDate: end ?? start ?? today,
            primaryLocation: location,
          }),
        )) as Record<string, unknown>,
      );
    },
  );

  server.registerTool(
    "tripit_trips_update",
    {
      title: "TripIt Trips Update",
      description: "Update an existing trip.",
      inputSchema: {
        id: z.string().min(1).describe("Trip ID or UUID."),
        name: z.string().optional().describe("New trip display name."),
        start: z.string().optional().describe("Updated start date in YYYY-MM-DD format."),
        end: z.string().optional().describe("Updated end date in YYYY-MM-DD format."),
        location: z.string().optional().describe("Updated primary location."),
        description: z.string().optional().describe("Trip description."),
      },
    },
    async ({ id, name, start, end, location, description }) =>
      jsonResult(
        (await withTripIt((client) =>
          client.updateTrip({
            id,
            displayName: name,
            startDate: start,
            endDate: end,
            primaryLocation: location,
            description,
          }),
        )) as Record<string, unknown>,
      ),
  );

  server.registerTool(
    "tripit_trips_delete",
    {
      title: "TripIt Trips Delete",
      description: "Delete a trip by ID or UUID.",
      inputSchema: {
        id: z.string().min(1).describe("Trip ID or UUID."),
      },
      annotations: {
        destructiveHint: true,
      },
    },
    async ({ id }) => jsonResult((await withTripIt((client) => client.deleteTrip(id))) as Record<string, unknown>),
  );
}
