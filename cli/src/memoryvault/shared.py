from pathlib import Path


def get_file_creation_time(file_path: Path) -> float:
    """
    Get the creation time of a file
    
    Args:
        file_path: Path to the file
    
    Returns:
        Timestamp (float) of the file's creation time
    """
    stat_info = file_path.stat()
    
    
    try:
        # Try to get birth time (creation time) - macOS specific
        return stat_info.st_birthtime
    except AttributeError:
        return stat_info.st_mtime
