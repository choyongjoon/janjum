import type { WebhookEvent } from '@clerk/backend';
import { httpRouter } from 'convex/server';
import { v } from 'convex/values';
import { Webhook } from 'svix';
import { internal } from './_generated/api';
import { httpAction, mutation, query } from './_generated/server';

const http = httpRouter();

http.route({
  path: '/clerk-users-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const event = await validateRequest(request);
    if (!event) {
      return new Response('Error occured', { status: 400 });
    }
    switch (event.type) {
      case 'user.created': // intentional fallthrough
      case 'user.updated':
        await ctx.runMutation(internal.users.upsertFromClerk, {
          data: event.data,
        });
        break;

      case 'user.deleted': {
        // biome-ignore  lint/style/noNonNullAssertion: it's safe
        const clerkUserId = event.data.id!;
        await ctx.runMutation(internal.users.deleteFromClerk, { clerkUserId });
        break;
      }
      default:
        // biome-ignore lint/suspicious/noConsole: it's ok to use console under convex
        console.log('Ignored Clerk webhook event', event.type);
    }

    return new Response(null, { status: 200 });
  }),
});

async function validateRequest(req: Request): Promise<WebhookEvent | null> {
  const payloadString = await req.text();
  const svixHeaders = {
    // biome-ignore  lint/style/noNonNullAssertion: it's safe
    'svix-id': req.headers.get('svix-id')!,
    // biome-ignore  lint/style/noNonNullAssertion: it's safe
    'svix-timestamp': req.headers.get('svix-timestamp')!,
    // biome-ignore  lint/style/noNonNullAssertion: it's safe
    'svix-signature': req.headers.get('svix-signature')!,
  };
  // biome-ignore  lint/style/noNonNullAssertion: it's safe
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  try {
    return wh.verify(payloadString, svixHeaders) as unknown as WebhookEvent;
  } catch (error) {
    // biome-ignore  lint/suspicious/noConsole: it's ok to use console under convex
    console.error('Error verifying webhook event', error);
    return null;
  }
}

// Additional functions for image optimization
export const generateUploadUrl = mutation({
  args: { uploadSecret: v.optional(v.string()) },
  handler: async (ctx, { uploadSecret }) => {
    // Verify upload secret for protected operations
    const expectedSecret = process.env.CONVEX_UPLOAD_SECRET;
    if (expectedSecret && uploadSecret !== expectedSecret) {
      throw new Error('Unauthorized: Invalid upload secret');
    }

    return await ctx.storage.generateUploadUrl();
  },
});

export const getStorageMetadata = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => {
    return await ctx.db.system.get(storageId);
  },
});

export const getStorageUrl = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});

export default http;
