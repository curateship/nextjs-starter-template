# Traefik Config Writer

Small internal service for Hub custom domains.

Hub verifies the custom-domain TXT record, builds the Traefik dynamic config, then sends it here. This service writes the file into Coolify's Traefik dynamic config directory so Traefik reloads the route without restarting the Hub container.

## Environment

```env
TRAEFIK_CONFIG_WRITER_TOKEN=
TRAEFIK_DYNAMIC_CONFIG_DIR=/data/coolify/proxy/dynamic
TRAEFIK_HUB_SERVICE=http-3-a5nnhgrzwx83prpn63pagwix@docker
PORT=3000
```

Mount Coolify's proxy dynamic config directory into the service at `TRAEFIK_DYNAMIC_CONFIG_DIR`.

Hub should use:

```env
TRAEFIK_DYNAMIC_CONFIG_ENDPOINT=http://traefik-config-writer:3000/configs
TRAEFIK_DYNAMIC_CONFIG_TOKEN=the-same-token
TRAEFIK_HUB_SERVICE=http-3-a5nnhgrzwx83prpn63pagwix@docker
```
