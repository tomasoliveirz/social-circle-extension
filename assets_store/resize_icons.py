import sys
import os
import subprocess

def resize_icon(source_path, dest_dir):
    try:
        # Check if source exists
        if not os.path.exists(source_path):
            print(f"Error: Source file not found at {source_path}")
            sys.exit(1)

        sizes = [16, 32, 48, 128]
        
        for size in sizes:
            dest_path = os.path.join(dest_dir, f"icon{size}.png")
            
            # Use rsvg-convert to convert SVG to PNG at specific size
            cmd = [
                "rsvg-convert",
                "-w", str(size),
                "-h", str(size),
                "-f", "png",
                "-o", dest_path,
                source_path
            ]
            
            subprocess.run(cmd, check=True)
            print(f"Created {dest_path} ({size}x{size})")
            
    except subprocess.CalledProcessError as e:
        print(f"Error running rsvg-convert: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error resizing icons: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # Get the directory where the script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Source is icon.svg in the same directory
    source = os.path.join(script_dir, "icon.svg")
    
    # Destination is the same directory
    dest = script_dir
    
    print(f"Generating icons from {source}...")
    resize_icon(source, dest)
