import { describe, it, expect } from "vitest";
import { parseTime, parseHMS, formatTime, formatCompact, isValidTime, formatFileSize } from "../time";
import {
  canonicalize, dirname, basenameWithoutExtension, isUnderFolder, isAudioPath,
} from "../audioPath";
import {
  clampSpeed, quantizeSpeed, formatSpeed, nextPreset, previousPreset, adjustedDuration, increaseSpeed,
} from "../playbackSpeed";
import {
  clampVolume, volumeToPercentage, volumeFromPercentage, calculateFadeOutVolume, increaseVolume,
} from "../volume";
import {
  startSleepTimer, remainingMs, isExpired, sleepProgress, fadeProgress, compareVersions, displayVersion,
} from "../sleepTimer";
import { addTracksToPlaylist, dedupeTracks, reorderTracks, type Playlist, type Track } from "../playlist";

describe("TimeParser port", () => {
  it("parses SS, MM:SS, HH:MM:SS", () => {
    expect(parseTime("90")).toBe(90_000);
    expect(parseTime("03:25")).toBe(205_000);
    expect(parseTime("1:02:03")).toBe(3_723_000);
  });
  it("rejects invalid input", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("1:75")).toBeNull();
    expect(parseTime("1:2:3:4")).toBeNull();
    expect(parseTime("-5")).toBeNull();
  });
  it("parses HMS fields with empty = 0", () => {
    expect(parseHMS("", "30", "")).toBe(1_800_000);
    expect(parseHMS("1", "60", "0")).toBeNull();
  });
  it("formats durations like the original", () => {
    expect(formatTime(205_000)).toBe("03:25");
    expect(formatTime(3_723_000)).toBe("01:02:03");
    expect(formatTime(-65_000)).toBe("-01:05");
    expect(formatCompact(3_723_000)).toBe("1h 2m");
    expect(formatCompact(125_000)).toBe("2m 5s");
    expect(formatCompact(9_000)).toBe("9s");
  });
  it("validates range and formats file size", () => {
    expect(isValidTime(5, 10)).toBe(true);
    expect(isValidTime(11, 10)).toBe(false);
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("AudioPathUtils port", () => {
  it("canonicalizes paths", () => {
    expect(canonicalize("  /music//rock/./song.mp3 ")).toBe("/music/rock/song.mp3");
    expect(canonicalize("/music/a/../song.flac")).toBe("/music/song.flac");
    expect(canonicalize("C:\\Music\\Song.MP3")).toBe("C:/Music/Song.MP3");
  });
  it("dirname / basenameWithoutExtension / isUnderFolder", () => {
    expect(dirname("/a/b/c.mp3")).toBe("/a/b");
    expect(basenameWithoutExtension("/a/b/c.mp3")).toBe("c");
    expect(isUnderFolder("/a/b", "/a/b/c/d.mp3")).toBe(true);
    expect(isUnderFolder("/a/b", "/a/bc/d.mp3")).toBe(false);
    expect(isUnderFolder("/a/b", "/a/b")).toBe(false);
  });
  it("recognizes supported audio extensions", () => {
    for (const ext of ["mp3", "flac", "wav", "aac", "ogg", "m4a", "MP3"]) {
      expect(isAudioPath(`/x/song.${ext}`)).toBe(true);
    }
    expect(isAudioPath("/x/notes.txt")).toBe(false);
  });
});

describe("PlaybackSpeedUtils port", () => {
  it("clamps and quantizes to 0.05 steps", () => {
    expect(clampSpeed(3)).toBe(2);
    expect(clampSpeed(0.1)).toBe(0.5);
    expect(quantizeSpeed(1.1500000001)).toBe(1.15);
    expect(increaseSpeed(1)).toBe(1.05);
  });
  it("formats speed", () => {
    expect(formatSpeed(1)).toBe("1x");
    expect(formatSpeed(1.5)).toBe("1.5x");
    expect(formatSpeed(0.75)).toBe("0.75x");
  });
  it("cycles presets", () => {
    expect(nextPreset(1)).toBe(1.25);
    expect(nextPreset(2)).toBe(0.5);
    expect(nextPreset(1.1)).toBe(1.25);
    expect(previousPreset(0.5)).toBe(2);
    expect(previousPreset(1.1)).toBe(1);
  });
  it("adjusts duration", () => {
    expect(adjustedDuration(120_000, 2)).toBe(60_000);
    expect(adjustedDuration(120_000, 0)).toBe(120_000);
  });
});

describe("VolumeUtils port", () => {
  it("clamps and converts", () => {
    expect(clampVolume(1.4)).toBe(1);
    expect(volumeToPercentage(0.456)).toBe(46);
    expect(volumeFromPercentage(150)).toBe(1);
    expect(increaseVolume(0.98)).toBe(1);
  });
  it("fades out linearly", () => {
    expect(calculateFadeOutVolume(0.8, 0)).toBe(0.8);
    expect(calculateFadeOutVolume(0.8, 0.5)).toBeCloseTo(0.4);
    expect(calculateFadeOutVolume(0.8, 1)).toBe(0);
    expect(calculateFadeOutVolume(0.8, 2)).toBe(0);
  });
});

describe("SleepTimer + VersionUtils port", () => {
  const now = 1_000_000;
  it("computes remaining / expiry / progress", () => {
    const t = startSleepTimer(30 * 60_000, true, now);
    expect(remainingMs(t, now + 10 * 60_000)).toBe(20 * 60_000);
    expect(isExpired(t, now + 31 * 60_000)).toBe(true);
    expect(sleepProgress(t, now + 15 * 60_000)).toBe(0.5);
  });
  it("end-of-track timers never expire", () => {
    const t = startSleepTimer(0, true, now);
    expect(t.endOfTrack).toBe(true);
    expect(isExpired(t, now + 999_999_999)).toBe(false);
  });
  it("fade progress only inside the fade window", () => {
    const t = startSleepTimer(60_000, true, now);
    expect(fadeProgress(t, 5, now)).toBeNull();
    expect(fadeProgress(t, 5, now + 57_500)).toBeCloseTo(0.5);
    expect(fadeProgress({ ...t, fadeOutEnabled: false }, 5, now + 59_000)).toBeNull();
  });
  it("compares versions", () => {
    expect(displayVersion("0.1.0")).toBe("v0.1.0");
    expect(displayVersion("v1.2")).toBe("v1.2");
    expect(compareVersions("v0.2.0", "0.1.41")).toBe(1);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.1.0", "0.1.1")).toBe(-1);
  });
});

describe("Playlist duplicate prevention", () => {
  const mk = (id: string, path: string): Track => ({ id, path, title: id, durationMs: 1000, fileSizeBytes: 1 });
  const base: Playlist = { id: "p1", name: "P", trackIds: ["a"], createdAt: 0, updatedAt: 0 };
  it("skips duplicates by canonical path", () => {
    const lib = new Map([["/music/a.mp3", mk("a", "/music/a.mp3")]]);
    lib.set("/music/b.mp3", mk("b", "/music/b.mp3"));
    const result = addTracksToPlaylist(base, [mk("a2", "/music//a.mp3"), mk("b", "/music/b.mp3")], lib);
    expect(result.trackIds).toEqual(["a", "b"]);
  });
  it("returns same reference when all duplicates", () => {
    const lib = new Map([["/music/a.mp3", mk("a", "/music/a.mp3")]]);
    const result = addTracksToPlaylist(base, [mk("a2", "/music/./a.mp3")], lib);
    expect(result).toBe(base);
  });
  it("dedupes track lists and reorders", () => {
    expect(dedupeTracks([mk("1", "/x/a.mp3"), mk("2", "/x//a.mp3"), mk("3", "/x/b.mp3")]).map((t) => t.id)).toEqual(["1", "3"]);
    const p: Playlist = { ...base, trackIds: ["a", "b", "c"] };
    expect(reorderTracks(p, 0, 2).trackIds).toEqual(["b", "c", "a"]);
    expect(reorderTracks(p, 5, 0)).toBe(p);
  });
});
