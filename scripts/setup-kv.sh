#!/bin/bash

# Setup script for Cloudflare KV namespace for OIDC authentication
# This script creates the necessary KV namespaces for rate limiting and token storage

echo "🔧 Setting up Cloudflare KV namespace for OIDC authentication..."

# Check if user is logged in
if ! pnpm wrangler whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Cloudflare"
    echo "Please run: pnpm wrangler login"
    exit 1
fi

echo "📦 Creating production KV namespace..."
PROD_KV_ID=$(pnpm wrangler kv:namespace create "AUTH_KV" | grep "id" | cut -d'"' -f4)

if [ -z "$PROD_KV_ID" ]; then
    echo "❌ Failed to create production KV namespace"
    exit 1
fi

echo "📦 Creating preview KV namespace..."
PREVIEW_KV_ID=$(pnpm wrangler kv:namespace create "AUTH_KV_PREVIEW" | grep "id" | cut -d'"' -f4)

if [ -z "$PREVIEW_KV_ID" ]; then
    echo "❌ Failed to create preview KV namespace"
    exit 1
fi

echo "✅ KV namespaces created successfully!"
echo "📝 Production KV ID: $PROD_KV_ID"
echo "📝 Preview KV ID: $PREVIEW_KV_ID"

echo ""
echo "🔧 Now update your wrangler.jsonc file:"
echo "Replace 'YOUR_KV_NAMESPACE_ID' with: $PROD_KV_ID"
echo "Replace 'YOUR_PREVIEW_KV_NAMESPACE_ID' with: $PREVIEW_KV_ID"

echo ""
echo "📋 Example wrangler.jsonc configuration:"
cat << EOF
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "$PROD_KV_ID",
      "preview_id": "$PREVIEW_KV_ID"
    },
  ],
EOF

echo ""
echo "🎉 Setup complete! You can now use KV for rate limiting and token storage."
echo "💡 Don't forget to update wrangler.jsonc with the IDs above!"