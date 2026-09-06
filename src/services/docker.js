import fs from 'fs';
import path from 'path';
import Docker from 'dockerode';
import tar from 'tar-fs';
import { config } from '../config.js';

class DockerService {
  constructor() {
    this.isAvailable = false;
    try {
      this.docker = new Docker({ socketPath: config.dockerSocket });
      this.checkConnection();
    } catch (err) {
      console.warn('[Docker] Docker-Initialisierung fehlgeschlagen:', err.message);
    }
  }

  async checkConnection() {
    try {
      await this.docker.ping();
      this.isAvailable = true;
      console.log(`[Docker] Erfolgreich verbunden mit Docker Daemon (${config.dockerSocket})`);
      await this.ensureNetwork();
    } catch (err) {
      this.isAvailable = false;
      console.warn(`[Docker] Docker Daemon nicht erreichbar (${config.dockerSocket}). Statische Seiten funktionieren trotzdem. Für interaktive Apps bitte Docker starten.`);
    }
  }

  async ensureNetwork() {
    if (!this.isAvailable) return;
    try {
      const networks = await this.docker.listNetworks();
      const exists = networks.some(n => n.Name === config.dockerNetwork);
      if (!exists) {
        await this.docker.createNetwork({
          Name: config.dockerNetwork,
          Driver: 'bridge'
        });
        console.log(`[Docker] Netzwerk '${config.dockerNetwork}' erfolgreich erstellt.`);
      }
    } catch (err) {
      console.error(`[Docker] Fehler beim Erstellen des Netzwerks '${config.dockerNetwork}':`, err.message);
    }
  }

  /**
   * Build image from app directory and run container
   */
  async buildAndRun(appId, appDir, port = 3000, options = {}) {
    if (!this.isAvailable) {
      throw new Error('Docker ist auf diesem Host nicht verfügbar oder nicht gestartet.');
    }

    const containerName = `snaphost-app-${appId}`;
    const imageName = `snaphost-img-${appId}:latest`;

    // 1. Check if Dockerfile exists. If not, auto-generate standard Node.js Dockerfile
    const dockerfilePath = path.join(appDir, 'Dockerfile');
    if (!fs.existsSync(dockerfilePath)) {
      const buildCmd = options.build ? `RUN ${options.build}\n` : '';
      const startCmd = options.start ? `CMD ["sh", "-c", "${options.start}"]` : 'CMD ["npm", "start"]';

      if (fs.existsSync(path.join(appDir, 'package.json'))) {
        const generatedDockerfile = `FROM node:22-alpine
WORKDIR /app
COPY . .
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
${buildCmd}ENV PORT=${port}
ENV NODE_ENV=production
EXPOSE ${port}
${startCmd}
`;
        fs.writeFileSync(dockerfilePath, generatedDockerfile, 'utf-8');
        console.log(`[Docker] Automatisches Node.js Dockerfile für App ${appId} erstellt.`);
      } else if (fs.existsSync(path.join(appDir, 'server.js')) || fs.existsSync(path.join(appDir, 'app.js'))) {
        const startFile = fs.existsSync(path.join(appDir, 'server.js')) ? 'server.js' : 'app.js';
        const singleStartCmd = options.start ? `CMD ["sh", "-c", "${options.start}"]` : `CMD ["node", "${startFile}"]`;
        const generatedDockerfile = `FROM node:22-alpine
WORKDIR /app
COPY . .
${buildCmd}ENV PORT=${port}
ENV NODE_ENV=production
EXPOSE ${port}
${singleStartCmd}
`;
        fs.writeFileSync(dockerfilePath, generatedDockerfile, 'utf-8');
        console.log(`[Docker] Automatisches Single-File Node Dockerfile für App ${appId} erstellt.`);
      } else {
        throw new Error('Kein Dockerfile oder package.json/server.js für interaktive App gefunden.');
      }
    }

    // 2. Build Docker Image
    console.log(`[Docker] Starte Build für ${imageName}...`);
    const tarStream = tar.pack(appDir);
    const buildStream = await this.docker.buildImage(tarStream, {
      t: imageName,
      dockerfile: 'Dockerfile'
    });

    // Wait for build to finish while capturing logs
    const buildLogs = [];
    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(
        buildStream,
        (err, res) => {
          try {
            fs.writeFileSync(path.join(path.dirname(appDir), 'build.log'), buildLogs.join(''), 'utf-8');
          } catch (_) {}
          if (err) {
            const tail = buildLogs.slice(-12).join('');
            return reject(new Error(`Docker Build fehlgeschlagen:\n${tail || err.message}`));
          }
          resolve(res);
        },
        (progress) => {
          if (progress.stream) {
            buildLogs.push(progress.stream);
            process.stdout.write(`[Docker Build ${appId}] ${progress.stream}`);
          }
          if (progress.error) {
            buildLogs.push(`ERROR: ${progress.error}\n`);
            console.error(`[Docker Build Error ${appId}]`, progress.error);
          }
        }
      );
    });

    // 3. Remove old container if one exists with this name
    try {
      const oldContainer = this.docker.getContainer(containerName);
      await oldContainer.stop().catch(() => {});
      await oldContainer.remove().catch(() => {});
    } catch (_) {}

    // Prepare container environment
    const customEnv = options.env && typeof options.env === 'object'
      ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
      : [];

    const envVars = [`PORT=${port}`, 'NODE_ENV=production', ...customEnv];

    // 4. Create and start the container
    console.log(`[Docker] Starte Container ${containerName}...`);
    const container = await this.docker.createContainer({
      Image: imageName,
      name: containerName,
      Env: envVars,
      ExposedPorts: {
        [`${port}/tcp`]: {}
      },
      HostConfig: {
        PortBindings: {
          [`${port}/tcp`]: [{ HostIp: '127.0.0.1', HostPort: '' }]
        },
        NetworkMode: config.dockerNetwork,
        Memory: config.dockerMemoryLimit,
        RestartPolicy: {
          Name: 'on-failure',
          MaximumRetryCount: 3
        }
      }
    });

    await container.start();
    console.log(`[Docker] Container ${containerName} läuft erfolgreich.`);

    // Inspect container to resolve the dynamic host port or bridge IP
    let internalHost = '127.0.0.1';
    let internalPort = port;

    try {
      const inspect = await container.inspect();
      const portBindings = inspect.NetworkSettings?.Ports?.[`${port}/tcp`];
      if (portBindings && portBindings.length > 0 && portBindings[0].HostPort) {
        internalHost = '127.0.0.1';
        internalPort = parseInt(portBindings[0].HostPort, 10);
      } else {
        const net = inspect.NetworkSettings?.Networks?.[config.dockerNetwork] || Object.values(inspect.NetworkSettings?.Networks || {})[0];
        if (net && net.IPAddress) {
          internalHost = net.IPAddress;
          internalPort = port;
        }
      }
    } catch (inspectErr) {
      console.warn(`[Docker] Inspect nach Start fehlgeschlagen:`, inspectErr.message);
    }

    console.log(`[Docker] Routing für ${containerName}: http://${internalHost}:${internalPort}`);

    return {
      containerId: container.id,
      containerName,
      internalHost,
      internalPort
    };
  }

  /**
   * Resolve live host & port for a running container
   */
  async getContainerEndpoint(containerIdOrName, fallbackPort = 3000) {
    if (!this.isAvailable || !containerIdOrName) return null;
    try {
      const container = this.docker.getContainer(containerIdOrName);
      const inspect = await container.inspect();
      if (!inspect.State.Running) return null;

      // 1. Check for bound host port on 127.0.0.1
      const ports = inspect.NetworkSettings?.Ports || {};
      for (const [portSpec, bindings] of Object.entries(ports)) {
        if (bindings && bindings.length > 0 && bindings[0].HostPort) {
          return {
            host: bindings[0].HostIp || '127.0.0.1',
            port: parseInt(bindings[0].HostPort, 10)
          };
        }
      }

      // 2. Check for container bridge IP
      const networks = inspect.NetworkSettings?.Networks || {};
      const net = networks[config.dockerNetwork] || Object.values(networks)[0];
      if (net && net.IPAddress) {
        return {
          host: net.IPAddress,
          port: fallbackPort
        };
      }

      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Stop and remove container
   */
  async stopAndRemove(containerIdOrName) {
    if (!this.isAvailable || !containerIdOrName) return;
    try {
      const container = this.docker.getContainer(containerIdOrName);
      await container.stop({ t: 5 }).catch(() => {});
      await container.remove({ v: true, force: true }).catch(() => {});
      console.log(`[Docker] Container ${containerIdOrName} erfolgreich gestoppt und entfernt.`);
    } catch (err) {
      console.warn(`[Docker] Hinweis beim Entfernen von ${containerIdOrName}:`, err.message);
    }
  }

  /**
   * Stop container without removing
   */
  async stop(containerIdOrName) {
    if (!this.isAvailable || !containerIdOrName) return;
    try {
      const container = this.docker.getContainer(containerIdOrName);
      await container.stop({ t: 5 }).catch(() => {});
      console.log(`[Docker] Container ${containerIdOrName} gestoppt.`);
    } catch (err) {
      console.warn(`[Docker] Fehler beim Stoppen von ${containerIdOrName}:`, err.message);
    }
  }

  /**
   * Restart container
   */
  async restart(containerIdOrName) {
    if (!this.isAvailable || !containerIdOrName) return;
    const container = this.docker.getContainer(containerIdOrName);
    await container.restart({ t: 5 });
  }

  /**
   * Get recent logs from container
   */
  async getLogs(containerIdOrName, tail = 150) {
    if (!this.isAvailable || !containerIdOrName) {
      return 'Docker ist nicht verfügbar oder Container existiert nicht.';
    }
    try {
      const container = this.docker.getContainer(containerIdOrName);
      const logBuffer = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true
      });
      // Strip docker stream header bytes (8 bytes header per frame)
      const cleanLogs = logBuffer.toString('utf-8').replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, '');
      return cleanLogs || '(Keine Logs vorhanden)';
    } catch (err) {
      return `Fehler beim Abrufen der Logs: ${err.message}`;
    }
  }

  /**
   * Get container status
   */
  async getStatus(containerIdOrName) {
    if (!this.isAvailable || !containerIdOrName) return 'stopped';
    try {
      const container = this.docker.getContainer(containerIdOrName);
      const inspect = await container.inspect();
      if (inspect.State.Running) return 'running';
      if (inspect.State.Restarting) return 'restarting';
      return 'stopped';
    } catch (err) {
      return 'stopped';
    }
  }
}

export const dockerService = new DockerService();
