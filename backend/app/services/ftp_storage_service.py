import posixpath
from ftplib import FTP, FTP_TLS, error_perm

from ..core.config import settings


def open_shared_ftp() -> FTP:
    host = settings.library_ftp_host
    user = settings.library_ftp_username
    pwd = settings.library_ftp_password
    if not host or not user or not pwd:
        raise RuntimeError("FTP storage not configured. Set LIBRARY_FTP_HOST/USERNAME/PASSWORD.")

    timeout = float(settings.library_ftp_timeout_seconds or 30.0)
    if bool(settings.library_ftp_tls):
        ftp: FTP = FTP_TLS(timeout=timeout)
    else:
        ftp = FTP(timeout=timeout)

    ftp.connect(host=str(host), port=int(settings.library_ftp_port))
    ftp.login(user=str(user), passwd=str(pwd))

    if isinstance(ftp, FTP_TLS):
        ftp.prot_p()
    try:
        ftp.set_pasv(True)
    except Exception:
        pass
    return ftp


def ensure_posix_dir(ftp: FTP, directory: str) -> None:
    path = posixpath.normpath("/" + str(directory or "").lstrip("/"))
    parts = [p for p in path.split("/") if p]
    current = "/"
    ftp.cwd("/")
    for p in parts:
        current = posixpath.join(current, p)
        try:
            ftp.cwd(current)
        except Exception:
            try:
                ftp.mkd(current)
            except error_perm:
                pass
            ftp.cwd(current)


def ftp_upload(ftp: FTP, *, remote_dir: str, filename: str, fileobj) -> None:
    ensure_posix_dir(ftp, remote_dir)
    ftp.cwd(posixpath.normpath("/" + remote_dir.lstrip("/")))
    ftp.storbinary(f"STOR {filename}", fileobj, blocksize=1024 * 128)

