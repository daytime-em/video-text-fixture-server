import { parse } from "hls-parser";
import {
  MasterPlaylist,
  MediaPlaylist,
  Segment,
} from "hls-parser/types";
import path from "path";
import { promises as fs } from "fs";

export type FixtureFile = {
  relativePath: string;
  route: string;
};

export class FixtureStream {
  public playlistFile: FixtureFile;
  public masterPlaylist: MasterPlaylist;
  public variants: FixtureMediaPlaylist[];
  public streamName: string;

  constructor(
    streamName: string,
    playlistFile: FixtureFile,
    playlist: MasterPlaylist,
    variants: FixtureMediaPlaylist[]
  ) {
    this.streamName = streamName;
    this.playlistFile = playlistFile;
    this.masterPlaylist = playlist;
    this.variants = variants;
  }
}

export class FixtureMediaPlaylist {
  public playlistFile: FixtureFile;
  public mediaPlaylist: MediaPlaylist;
  public segments: FixtureSegment[];

  constructor(
    playlistFile: FixtureFile,
    playlist: MediaPlaylist,
    segments: FixtureSegment[]
  ) {
    this.mediaPlaylist = playlist;
    this.playlistFile = playlistFile;
    this.segments = segments;
  }

  segmentIndex(seconds: number): number | null {
    const { offset: start } = this.mediaPlaylist.start ?? { offset: 0, precise: false };
    let curTime = start;
    for (let i = 0; i < this.segments.length ; i++) {
      const segment = this.segments[i].mediaSegment;
      const duration = segment.duration;
      // round up. eg, "10sec in" w/ 5sec segments -> start of 3rd segment 
      if (seconds < curTime + duration) {
        // found
        return i;
      } 
      curTime += duration;
    }

    return null;
  }

  segmentAtTime(seconds: number): FixtureSegment | null {
    const index = this.segmentIndex(seconds);
    if (index != null) {
      return this.segments[index];
    } else {
      return null;
    }
  }

  segmentsInTimeRange(startSec: number, endSec?: number): FixtureSegment[] {
    let startIdx = this.segmentIndex(startSec);
    let endIdx = this.segmentIndex(endSec ?? Infinity);
    if (startIdx != null) {
      if (endIdx != null) {
        return this.segments.slice(startIdx, endIdx);
      }
      return this.segments.slice(startIdx)
    } else {
      return [];
    }
  }
}

export class FixtureSegment {
  public segmentFile: FixtureFile;
  public mediaSegment: Segment;

  constructor(segmentFile: FixtureFile, segment: Segment) {
    this.mediaSegment = segment;
    this.segmentFile = segmentFile;
  }
}

export async function parseFixtureStream(
  name: string,
  relativeBasedir: string = "files",
): Promise<FixtureStream> {
  const filesDir = path.join(__dirname, relativeBasedir);
  const streamPath = path.join(filesDir, name, "stream.m3u8");
  const mvp = parse((await fs.readFile(streamPath)).toString("utf8"));
  if (mvp instanceof MasterPlaylist) {
    const variants = mvp.variants.map(v => parseMediaPlaylist(relativeBasedir, name, v.uri));
    const relPath = path.relative(filesDir, streamPath);
    return new FixtureStream(
      name,
      { relativePath: relPath, route: "/" + relPath },
      mvp,
      await Promise.all(variants)
    );
  } else {
    throw `file at ${streamPath} was not a multivariant playlist`;
  }
}

export async function parseMediaPlaylist(
  relativeBasedir: string = 'files',
  streamName: string,
  uri: string
): Promise<FixtureMediaPlaylist> {
  const filesDir = path.join(__dirname, relativeBasedir);
  const playlistPath = path.resolve(path.join(filesDir, streamName, uri))
  const mediaPl = parse((await fs.readFile(playlistPath)).toString("utf-8"));
  if (mediaPl instanceof MediaPlaylist) {
    let segments: FixtureSegment[] = mediaPl.segments.map(segment => {
      // const segmentPath = `${basedir}/${path.dirname(uri)}/${segment.uri}`;
      const segmentPath = path.resolve(path.join(filesDir, streamName, path.dirname(uri), segment.uri));
      const relPath = path.relative(filesDir, segmentPath);
      return new FixtureSegment(
        { relativePath: relPath, route: "/" + relPath },
        segment
      );
    });

    const mpPath = path.relative(filesDir, playlistPath);
    return new FixtureMediaPlaylist(
      { relativePath: mpPath, route: "/" + mpPath },
      mediaPl,
      segments
    );
  } else {
    throw `file at ${uri} was not a media playlist`;
  }
}
