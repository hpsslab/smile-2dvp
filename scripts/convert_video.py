#!/usr/bin/env python3
"""Convert source videos into streaming-friendly MP4 files.

This script wraps ffmpeg with sane defaults for producing H.264 MP4 assets
that are compatible with standard browsers while preserving the original
audio track. It can be reused for future video prep work.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Down-convert a video into a web-safe MP4 using ffmpeg while "
            "preserving audio."
        )
    )
    parser.add_argument("input", type=Path, help="source video path")
    parser.add_argument("output", type=Path, help="destination MP4 path")
    parser.add_argument(
        "--target-width",
        type=int,
        default=1280,
        help="maximum output width (default: 1280)",
    )
    parser.add_argument(
        "--target-height",
        type=int,
        default=720,
        help="maximum output height (default: 720)",
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=30.0,
        help="target frame rate (default: 30)",
    )
    parser.add_argument(
        "--crf",
        type=float,
        default=20,
        help="libx264 quality CRF value (lower is higher quality; default: 20)",
    )
    parser.add_argument(
        "--preset",
        default="slow",
        help="libx264 preset controlling encode speed vs quality (default: slow)",
    )
    parser.add_argument(
        "--audio-bitrate",
        default="192k",
        help="target audio bitrate (default: 192k)",
    )
    parser.add_argument(
        "--maxrate",
        default="5M",
        help="peak video bitrate (default: 5M)",
    )
    parser.add_argument(
        "--bufsize",
        default="10M",
        help="video rate-control buffer size (default: 10M)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="only print the ffmpeg command without running it",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite existing output files",
    )
    return parser.parse_args()


def ensure_ffmpeg() -> str:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        sys.exit("ffmpeg executable not found in PATH")
    return ffmpeg_path


def build_filter(width: int, height: int) -> str:
    if width <= 0 or height <= 0:
        return "setsar=1"
    # Preserve aspect ratio, then letterbox if needed to guarantee the ROI dimensions.
    return (
        "scale='min({w},iw)':'min({h},ih)':force_original_aspect_ratio=decrease,".format(
            w=width,
            h=height,
        )
        + "pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1".format(
            w=width,
            h=height,
        )
    )


def run(args: argparse.Namespace) -> int:
    ffmpeg_path = ensure_ffmpeg()

    input_path = args.input.expanduser().resolve()
    output_path = args.output.expanduser().resolve()

    if not input_path.exists():
        sys.exit(f"Input file not found: {input_path}")

    if output_path.exists() and not args.force:
        sys.exit(
            f"Output file already exists: {output_path}. Use --force to overwrite."
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)

    filtergraph = build_filter(args.target_width, args.target_height)

    cmd = [
        ffmpeg_path,
        "-y" if args.force else "-n",
        "-i",
        str(input_path),
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-level",
        "4.1",
        "-preset",
        args.preset,
        "-crf",
        str(args.crf),
        "-pix_fmt",
        "yuv420p",
        "-r",
        str(args.fps),
        "-vf",
        filtergraph,
        "-maxrate",
        str(args.maxrate),
        "-bufsize",
        str(args.bufsize),
        "-c:a",
        "aac",
        "-b:a",
        str(args.audio_bitrate),
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        str(output_path),
    ]

    if args.dry_run:
        print(" \\\n    ".join(cmd))
        return 0

    completed = subprocess.run(cmd, check=False)
    return completed.returncode


def main() -> None:
    args = parse_args()
    if run(args) != 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
