# Cuts the waits out of the raw recording and writes an H.264 MP4.
# The waits are marked in the video itself: a magenta square in the top-left corner from the start of a wait,
# a cyan square at its end. Playwright's video drifts against the script's clock, so times are read from the frames.
import glob, os, subprocess, sys

raw = sorted(glob.glob("raw/*.webm"))[-1]
FPS = 25
probe = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", raw, "-vf", f"crop=12:12:4:4,scale=1:1,fps={FPS}",
                        "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
kinds, dark = [], []
for i in range(0, len(probe) - 2, 3):
    r, g, b = probe[i], probe[i + 1], probe[i + 2]
    kinds.append("m" if r > 200 and g < 80 and b > 200 else "c" if r < 80 and g > 200 and b > 200 else ".")
    dark.append(max(r, g, b) < 40)
n = len(kinds)
end = n / FPS

# A cut runs from the first magenta frame through the last frame of the cyan run that follows it.
cuts, i = [], 0
while i < n:
    if kinds[i] in "mc":
        start = i
        if not cuts and "m" not in kinds[:i] and kinds[i] == "c":
            # No start marker (older takes): cut the loading frames before the cyan, back to the dark title card
            # (or to the start if there is none).
            while start > 0 and not dark[start - 1]:
                start -= 1
        j = i
        while j < n and kinds[j] != "c":
            j += 1
        while j < n and kinds[j] == "c":
            j += 1
        cuts.append((start / FPS, j / FPS))
        i = j
    else:
        i += 1
print("cuts:", [(round(a, 2), round(b, 2)) for a, b in cuts])

keep, t = [], 0.0
for a, b in cuts:
    if a > t + 0.05:
        keep.append((t, a))
    t = max(t, b + 0.04)
if end > t + 0.05:
    keep.append((t, end))
keep = [(a, b) for a, b in keep if b - a > 0.5]

os.makedirs("seg", exist_ok=True)
for f in glob.glob("seg/*"):
    os.remove(f)
names = []
for k, (a, b) in enumerate(keep):
    name = f"seg/{k:02d}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{a:.3f}", "-i", raw, "-t", f"{b - a:.3f}",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-an", name], check=True)
    names.append(name)
open("seg/list.txt", "w").write("".join(f"file '{os.path.basename(x)}'\n" for x in names))
out = sys.argv[1] if len(sys.argv) > 1 else "fx-exposure-agent-demo.mp4"
speed = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0  # e.g. 1.07 to fit under 3:00
joined = "seg/joined.mp4" if speed != 1.0 else out
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "seg/list.txt", "-c", "copy",
                "-movflags", "+faststart", joined], check=True)
if speed != 1.0:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", joined, "-vf", f"setpts=PTS/{speed}", "-r", "30", "-c:v", "libx264",
                    "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], check=True)
kept = sum(b - a for a, b in keep)
print(f"{len(keep)} segments, {kept:.1f} s kept of {end:.1f} s, {kept / speed:.1f} s at {speed}x -> {out}")
