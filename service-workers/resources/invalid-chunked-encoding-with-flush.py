import time

def main(request, response):
    response.headers.append("Content-Type", "application/javascript")
    response.headers.append("Transfer-encoding", "chunked")
    response.write_status_headers()
    time.sleep(1);
    response.writer.write("XX\r\n\r\n")
