def main(request, response):
    headers = [("Content-Type", "application/javascript"),
               ("Transfer-encoding", "chunked")]
    body = "XX\r\n\r\n"
    return headers, body
