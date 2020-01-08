# koact-doc-to-definition

##  ![NPM version](https://img.shields.io/npm/v/koact-doc-to-definition.svg?style=flat)

# 怎么使用？

使用`npm`或`yarn`全局安装`koa-doc-to-definition`

在项目根目录下创建配置文件`koact-api-generator.config.json`：

```json
{
  "url": "http://localhost:3000",
  "destination": "./apis"
}
```

`url`为使用了`koact`作为路由组件的`koa`服务器地址；  
`destination`为希望API文件存放的文件夹地址。

在项目目录下执行`koact-doc-to-definition`指令即可。
