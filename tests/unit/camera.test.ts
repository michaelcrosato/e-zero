import { afterEach, describe, expect, it } from 'vitest';
import { interceptor, vehicle, type VehicleBody } from '../../src/config/vehicles';
import { dot, length, offset, sub, vec } from '../../src/core/vector';
import {
  drivingView,
  mountCamera,
  pilotCamera,
  updateLook,
  vehiclePose,
} from '../../src/render/driving-view';
import { senseTraffic } from '../../src/render/traffic';
import { game, held, player, touch } from '../../src/sim/state';
import { course, courseLength, sampleCourse } from '../../src/track/course';
import { sampleSpatial, skyline } from '../../src/track/spatial';

afterEach(() => {
  course.id = 'classic';
  vehicle.model = interceptor;
  drivingView.mode = 'chase';
  drivingView.lookYaw = 0;
  held.clear();
  touch.lookLeft = touch.lookRight = false;
  Object.assign(game, { mode: 'title', cameraBlend: 0, cameraYaw: 0, worldTime: 0 });
  Object.assign(player, { s: 0, x: 0, steer: 0, kickV: 0, v: 0 });
});

describe('vehicle-mounted cameras', () => {
  it.each(['classic', 'skyline'] as const)(
    'stays at the %s pilot mount across laps, boost and finish orbit',
    (id) => {
      course.id = id;
      for (const s of [-courseLength() * 3 - 20, 0, 391, courseLength() * 4 + 27]) {
        Object.assign(player, { s, x: 73, steer: -0.6, kickV: 17, v: 2000 });
        Object.assign(game, { worldTime: 2, cameraBlend: 1, cameraYaw: 2.7 });
        const body = vehicle.model[id];
        const pose = vehiclePose(sampleCourse(s, 73), body, id, -0.6, 17, 2);
        const camera = pilotCamera(16 / 9);
        const local = sub(camera.eye, pose);
        expect(dot(local, pose.right)).toBeCloseTo(body.pilotEye.x * body.scale.x, 8);
        expect(dot(local, pose.forward)).toBeCloseTo(body.pilotEye.y * body.scale.y, 8);
        expect(dot(local, pose.up)).toBeCloseTo(body.pilotEye.z * body.scale.z, 8);
        player.v = 0;
        game.cameraBlend = 0;
        game.cameraYaw = 0;
        expect(pilotCamera(16 / 9)).toEqual(camera);
      }
    },
  );

  it('follows the canopy through every loop and corkscrew orientation without moving the eye to look around', () => {
    for (const part of skyline.sections.filter(
      (s) => s.kind === 'loop' || s.kind === 'corkscrew',
    )) {
      for (let i = 0; i <= 100; i++) {
        const road = sampleSpatial(part.start + ((part.end - part.start) * i) / 100, 50);
        const body = interceptor.skyline;
        const pose = vehiclePose(road, body, 'skyline', 0.7, 0, 1);
        const forward = mountCamera(pose, body, body.pilotEye, 0, 1.05);
        for (const yaw of [-1.445, 0, 1.445]) {
          const view = mountCamera(pose, body, body.pilotEye, yaw, 1.05);
          expect(view.eye).toEqual(forward.eye);
          expect(dot(view.up, pose.up)).toBeCloseTo(1, 10);
          expect(dot(view.forward, view.right)).toBeCloseTo(0, 10);
          expect(dot(view.forward, view.up)).toBeCloseTo(0, 10);
          expect(length(view.forward)).toBeCloseTo(1, 10);
        }
      }
    }
  });

  it('takes offsets and scale from a different vehicle, including an off-centre seat', () => {
    const body: VehicleBody = {
      ...interceptor.skyline,
      scale: vec(1.5, 2, 3),
      pilotEye: vec(-4, 7, 24),
    };
    vehicle.model = { ...interceptor, id: 'test-two-seat', skyline: body };
    course.id = 'skyline';
    player.s = skyline.length * 0.64;
    const pose = vehiclePose(sampleCourse(player.s), body, 'skyline', 0, 0, 0);
    const expected = offset(pose, -6, 72, 14);
    expect(length(sub(pilotCamera(16 / 9).eye, expected))).toBeLessThan(1e-9);
    expect(pilotCamera(0.5).eye).toEqual(pilotCamera(2).eye);
  });

  it('keeps the default pilot eyes inside their modeled glass canopies', () => {
    expect(interceptor.skyline.pilotEye).toEqual(vec(0, 8, 15));
    expect(interceptor.skyline.pilotEye.y).toBeLessThan(13);
    expect(interceptor.skyline.pilotEye.z).toBeGreaterThan(11);
    expect(interceptor.skyline.pilotEye.z).toBeLessThan(17);
    expect(interceptor.classic.pilotEye.y).toBeLessThan(8);
    expect(interceptor.classic.pilotEye.z).toBeGreaterThan(7.5);
    expect(interceptor.classic.pilotEye.z).toBeLessThan(13);
  });

  it('glances independently from steering and recentres on release or pause', () => {
    Object.assign(game, { mode: 'race' });
    drivingView.mode = 'cockpit';
    player.steer = 0.4;
    held.add('KeyQ');
    updateLook(1, false);
    expect(drivingView.lookYaw).toBeLessThan(-1.4);
    expect(player.steer).toBe(0.4);
    held.add('KeyE');
    updateLook(1, false);
    expect(drivingView.lookYaw).toBe(0);
    held.delete('KeyQ');
    updateLook(1, false);
    expect(drivingView.lookYaw).toBeGreaterThan(1.4);
    Object.assign(game, { mode: 'paused' });
    updateLook(1, false);
    expect(drivingView.lookYaw).toBe(0);
    Object.assign(game, { mode: 'race' });
    held.clear();
    touch.lookLeft = true;
    updateLook(1 / 120, true);
    expect(drivingView.lookYaw).toBeLessThan(-1.4);
    touch.lookLeft = false;
    updateLook(1 / 120, true);
    expect(drivingView.lookYaw).toBe(0);
  });
});

describe('side traffic display', () => {
  const car = { id: 1, s: 9950, x: -55, v: 600, color: 0 };
  it('detects a closing car behind the left side across the start/finish seam', () => {
    const [contact] = senseTraffic({ s: 10, x: 5, v: 500 }, [car], 10000);
    expect(contact.ahead).toBe(-60);
    expect(contact.lateral).toBe(-60);
    expect(contact.closingSpeed).toBe(100);
    expect(contact.approaching).toBe(true);
    expect(contact.alongside).toBe(false);
  });
  it('shows alongside traffic and rejects distant or receding vehicles', () => {
    const contacts = senseTraffic(
      { s: 10000, x: 0, v: 500 },
      [
        car,
        { ...car, id: 2, s: 50, x: 60, v: 500 },
        { ...car, id: 3, s: 9850, v: 400 },
        { ...car, id: 4, s: 7500 },
        { ...car, id: 5, x: 1000 },
      ],
      10000,
    );
    expect(contacts.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(contacts[0].alongside).toBe(true);
    expect(contacts[1].lateral).toBe(60);
    expect(contacts[1].approaching).toBe(false);
    expect(contacts[2].approaching).toBe(false);
    expect(senseTraffic({ s: 5, x: 0, v: 500 }, [], 10000)).toEqual([]);
  });
});
