import RAPIER from '@dimforge/rapier3d-compat'

// Rapier world with no gravity. Every body is pulled toward the origin by a
// clamped spring, and pushed away from the pointer's ray. No DOM or three
// here, so it can be stepped headless.
export async function createPhysics(CONFIG) {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = CONFIG.dt
  const items = new Set()

  // hulls: Float32Array xyz point clouds, in the body's own space
  function addBody(hulls, { position, rotation, linvel, angvel }) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setRotation(rotation)
        .setLinvel(linvel.x, linvel.y, linvel.z)
        .setAngvel(angvel)
        .setLinearDamping(CONFIG.linearDamping)
        .setAngularDamping(CONFIG.angularDamping)
        .setCanSleep(false)
        .setCcdEnabled(true)
    )
    const colliders = hulls.map((points) => {
      const desc = RAPIER.ColliderDesc.convexHull(points)
      if (!desc) throw new Error('convex hull failed')
      return world.createCollider(
        desc
          .setDensity(1)
          .setRestitution(CONFIG.restitution)
          .setFriction(CONFIG.friction),
        body
      )
    })
    const item = { body, colliders }
    items.add(item)
    return item
  }

  function removeBody(item) {
    world.removeRigidBody(item.body) // takes its colliders with it
    items.delete(item)
  }

  function setDamping() {
    for (const { body } of items) {
      body.setLinearDamping(CONFIG.linearDamping)
      body.setAngularDamping(CONFIG.angularDamping)
    }
  }

  function setSurface() {
    for (const { colliders } of items)
      for (const c of colliders) {
        c.setRestitution(CONFIG.restitution)
        c.setFriction(CONFIG.friction)
      }
  }

  // a one-off outward kick from `center`: velocity change of blastStrength at
  // the centre, falling off linearly to 0 at blastRadius, plus a random tumble
  function explode(center, scale = 1) {
    const R = CONFIG.blastRadius
    for (const { body } of items) {
      const p = body.translation()
      let dx = p.x - center.x
      let dy = p.y - center.y
      let dz = p.z - center.z
      let dist = Math.hypot(dx, dy, dz)
      if (dist >= R) continue
      if (dist < 1e-4) {
        // sitting on the blast: any direction will do
        dx = Math.random() - 0.5
        dy = Math.random() - 0.5
        dz = Math.random() - 0.5
        dist = Math.hypot(dx, dy, dz) || 1
      }
      const f = 1 - dist / R
      const dv = (CONFIG.blastStrength * scale * f) / dist
      const m = body.mass()
      body.applyImpulse(
        { x: dx * dv * m, y: dy * dv * m, z: dz * dv * m },
        true
      )
      const w = body.angvel()
      const spin = CONFIG.blastSpin * scale * f
      body.setAngvel(
        {
          x: w.x + (Math.random() - 0.5) * 2 * spin,
          y: w.y + (Math.random() - 0.5) * 2 * spin,
          z: w.z + (Math.random() - 0.5) * 2 * spin
        },
        true
      )
    }
  }

  // ray: { origin, dir } with dir normalised, or null when the pointer is away
  function step(ray, repelScale = 1) {
    const dt = CONFIG.dt
    for (const { body } of items) {
      const p = body.translation()
      const m = body.mass()

      // pull to the centre: accel = -k·p, capped so stragglers don't slingshot
      let ax = -CONFIG.attraction * p.x
      let ay = -CONFIG.attraction * p.y
      let az = -CONFIG.attraction * p.z
      const a = Math.hypot(ax, ay, az)
      if (a > CONFIG.maxPull) {
        const s = CONFIG.maxPull / a
        ax *= s
        ay *= s
        az *= s
      }

      // push away from the closest point on the pointer ray, so everything
      // under the cursor moves whatever its depth
      if (ray) {
        const { origin: o, dir: d } = ray
        const t = (p.x - o.x) * d.x + (p.y - o.y) * d.y + (p.z - o.z) * d.z
        let ox = p.x - (o.x + d.x * t)
        let oy = p.y - (o.y + d.y * t)
        let oz = p.z - (o.z + d.z * t)
        let dist = Math.hypot(ox, oy, oz)
        const R = CONFIG.repelRadius
        if (dist < R) {
          if (dist < 1e-4) {
            // dead on the ray: pick any direction across it
            ox = -d.y
            oy = d.x
            oz = 0
            dist = Math.hypot(ox, oy) || 1
          }
          const f = 1 - dist / R
          const push = (CONFIG.repelStrength * repelScale * f * f) / dist
          ax += ox * push
          ay += oy * push
          az += oz * push
          const spin = CONFIG.repelSpin * f * m * dt
          body.applyTorqueImpulse(
            {
              x: (Math.random() - 0.5) * spin,
              y: (Math.random() - 0.5) * spin,
              z: (Math.random() - 0.5) * spin
            },
            true
          )
        }
      }

      body.applyImpulse(
        { x: ax * m * dt, y: ay * m * dt, z: az * m * dt },
        true
      )
    }
    world.step()
  }

  return {
    world,
    items,
    addBody,
    removeBody,
    setDamping,
    setSurface,
    explode,
    step
  }
}
